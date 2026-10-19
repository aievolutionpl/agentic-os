import { RpcProcess, type ProcessSpec } from "./rpc.js";
import { object, text, redact } from "./validate.js";
export interface AgentInput {
  cwd: string;
  prompt: string;
  readOnly: boolean;
  threadId?: string | null;
  signal: AbortSignal;
  session: (threadId: string, turnId: string | null) => void;
  activity: (kind: string, text: string) => void;
}
export interface AgentResult {
  threadId: string;
  turnId: string;
  summary: string;
}
export interface AgentAdapter {
  run(input: AgentInput): Promise<AgentResult>;
  close(): void;
  stopped(): Promise<boolean>;
  steer?(instruction: string): Promise<void>;
}
export class CodexAdapter implements AgentAdapter {
  readonly rpc: RpcProcess;
  private threadId = "";
  private turnId = "";
  constructor(spec: ProcessSpec) {
    this.rpc = new RpcProcess(spec);
  }
  async initialize() {
    await this.rpc.request("initialize", {
      clientInfo: {
        name: "agenting_os",
        title: "Agenting OS",
        version: "0.4.0",
      },
    });
    this.rpc.notify("initialized");
  }
  async account() {
    return this.rpc.request("account/read", { refreshToken: false });
  }
  async login() {
    return this.rpc.request("account/login/start", { type: "chatgpt" });
  }
  async run(input: AgentInput): Promise<AgentResult> {
    await this.initialize();
    const thread = await this.rpc.request(
      input.threadId ? "thread/resume" : "thread/start",
      {
        ...(input.threadId ? { threadId: input.threadId } : {}),
        cwd: input.cwd,
        approvalPolicy: "never",
        sandbox: input.readOnly ? "read-only" : "workspace-write",
        config: { web_search: "disabled" },
      },
    );
    this.threadId = text(object(thread.thread).id);
    input.session(this.threadId, null);
    let summary = "";
    const done = new Promise<AgentResult>((resolve, reject) => {
      const stop = () => reject(Error("RUN_CANCELLED"));
      const disconnected = () => reject(Error("PROVIDER_DISCONNECTED"));
      const notification = (message: any) => {
        const p = message.params ?? {};
        if (p.threadId && p.threadId !== this.threadId) return;
        if (message.method === "turn/started") {
          this.turnId = text(p.turn.id);
          input.session(this.threadId, this.turnId);
        } else if (
          message.method === "item/agentMessage/delta" &&
          typeof p.delta === "string"
        ) {
          summary = (summary + p.delta).slice(-16000);
          input.activity("message", redact(summary, 8000));
        } else if (
          message.method === "item/started" ||
          message.method === "item/completed"
        ) {
          const item = p.item ?? {};
          if (item.type === "agentMessage" && typeof item.text === "string") {
            summary = item.text.slice(-16000);
            input.activity("message", redact(summary, 8000));
          } else if (
            ["commandExecution", "fileChange", "mcpToolCall"].includes(
              item.type,
            )
          )
            input.activity(
              item.type,
              `${message.method.endsWith("completed") ? "Completed" : "Started"}: ${typeof item.command === "string" ? item.command : item.type}`,
            );
        } else if (message.method === "turn/completed") {
          if (p.turn?.status === "completed")
            resolve({
              threadId: this.threadId,
              turnId: this.turnId || String(p.turn.id),
              summary: redact(summary, 8000),
            });
          else
            reject(
              Error(
                p.turn?.status === "interrupted"
                  ? "RUN_CANCELLED"
                  : "PROVIDER_TURN_FAILED",
              ),
            );
        }
      };
      const request = (message: any) => {
        // Escapes, network grants, elicitation and tools are never silently approved.
        if (
          message.method === "item/commandExecution/requestApproval" ||
          message.method === "item/fileChange/requestApproval"
        )
          this.rpc.respond(message.id, { decision: "decline" });
        else this.rpc.reject(message.id);
        input.activity(
          "policy",
          "Provider request declined by the configured sandbox policy.",
        );
      };
      input.signal.addEventListener("abort", stop, { once: true });
      this.rpc.on("notification", notification);
      this.rpc.on("request", request);
      this.rpc.once("disconnect", disconnected);
      const cleanup = () => {
        input.signal.removeEventListener("abort", stop);
        this.rpc.off("notification", notification);
        this.rpc.off("request", request);
        this.rpc.off("disconnect", disconnected);
      };
      this.cleanup = cleanup;
    });
    // Attach a rejection observer before issuing turn/start to avoid cancellation races.
    void done.catch(() => {});
    try {
      if (input.signal.aborted) throw Error("RUN_CANCELLED");
      const started = await this.rpc.request("turn/start", {
        threadId: this.threadId,
        input: [{ type: "text", text: input.prompt }],
        approvalPolicy: "never",
        sandboxPolicy: input.readOnly
          ? { type: "readOnly", networkAccess: false }
          : {
              type: "workspaceWrite",
              writableRoots: [input.cwd],
              networkAccess: false,
              excludeSlashTmp: true,
              excludeTmpdirEnvVar: true,
            },
      });
      this.turnId = text(object(started.turn).id);
      input.session(this.threadId, this.turnId);
      return await done;
    } finally {
      if (input.signal.aborted && this.threadId && this.turnId)
        await this.rpc
          .request(
            "turn/interrupt",
            { threadId: this.threadId, turnId: this.turnId },
            1500,
          )
          .catch(() => {});
      this.cleanup?.();
      this.close();
      if (!(await this.stopped())) throw Error("STOP_UNCONFIRMED");
    }
  }
  private cleanup?: () => void;
  async steer(instruction: string) {
    if (!this.threadId || !this.turnId) throw Error("TURN_NOT_RUNNING");
    await this.rpc.request("turn/steer", {
      threadId: this.threadId,
      expectedTurnId: this.turnId,
      input: [{ type: "text", text: instruction }],
    });
  }
  close() {
    this.rpc.close();
  }
  stopped() {
    return this.rpc.waitClosed();
  }
}
