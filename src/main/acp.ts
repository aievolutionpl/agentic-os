import { randomUUID } from "node:crypto";
import { RpcProcess, type ProcessSpec } from "./rpc.js";
import type { AgentAdapter, AgentInput, AgentResult } from "./providers.js";
import { text, redact } from "./validate.js";
// ACP v1. The selected executable is trusted local code and must enforce its own OS sandbox.
export class AcpAdapter implements AgentAdapter {
  readonly rpc: RpcProcess;
  constructor(spec: ProcessSpec) {
    this.rpc = new RpcProcess(spec);
  }
  async run(input: AgentInput): Promise<AgentResult> {
    let sessionId = "",
      summary = "";
    const turnId = `acp:${randomUUID()}`;
    const notification = (message: any) => {
      const p = message.params ?? {},
        update = p.update ?? {};
      if (message.method !== "session/update" || p.sessionId !== sessionId)
        return;
      if (
        update.sessionUpdate === "agent_message_chunk" &&
        update.content?.type === "text"
      ) {
        summary = (summary + String(update.content.text)).slice(-16000);
        input.activity("message", redact(summary, 8000));
      } else if (
        ["tool_call", "tool_call_update", "plan"].includes(update.sessionUpdate)
      )
        input.activity("tool", String(update.title ?? update.sessionUpdate));
    };
    const request = (message: any) => {
      if (message.method === "session/request_permission") {
        const option = message.params?.options?.find(
          (option: any) =>
            option.kind === "reject_once" || option.kind === "reject_always",
        );
        this.rpc.respond(message.id, {
          outcome: option
            ? { outcome: "selected", optionId: option.optionId }
            : { outcome: "cancelled" },
        });
      } else this.rpc.reject(message.id);
      input.activity(
        "policy",
        "ACP permission request declined. Host file and terminal capabilities are disabled.",
      );
    };
    const abort = () => {
      if (sessionId) this.rpc.notify("session/cancel", { sessionId });
      this.close();
    };
    this.rpc.on("notification", notification);
    this.rpc.on("request", request);
    input.signal.addEventListener("abort", abort, { once: true });
    try {
      const init = await this.rpc.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: "agenting-os", version: "0.4.0" },
      });
      if (init.protocolVersion !== 1) throw Error("ACP_VERSION_UNSUPPORTED");
      if (input.threadId && !init.agentCapabilities?.loadSession)
        throw Error("ACP_RESUME_UNSUPPORTED");
      const session = await this.rpc.request(
        input.threadId ? "session/load" : "session/new",
        {
          ...(input.threadId ? { sessionId: input.threadId } : {}),
          cwd: input.cwd,
          mcpServers: [],
        },
      );
      sessionId = input.threadId || text(session.sessionId);
      input.session(sessionId, turnId);
      if (input.readOnly) {
        const mode = session.modes?.availableModes?.find((mode: any) =>
          ["plan", "read-only", "readonly"].includes(mode.id),
        );
        if (!mode) throw Error("ACP_READ_ONLY_MODE_REQUIRED");
        await this.rpc.request("session/set_mode", {
          sessionId,
          modeId: mode.id,
        });
      }
      if (input.signal.aborted) throw Error("RUN_CANCELLED");
      const result = await this.rpc.request(
        "session/prompt",
        { sessionId, prompt: [{ type: "text", text: input.prompt }] },
        20 * 60 * 1000,
      );
      if (result.stopReason !== "end_turn") throw Error("ACP_TURN_INCOMPLETE");
      return { threadId: sessionId, turnId, summary: redact(summary, 8000) };
    } finally {
      input.signal.removeEventListener("abort", abort);
      this.rpc.off("notification", notification);
      this.rpc.off("request", request);
      this.close();
      if (!(await this.stopped())) throw Error("STOP_UNCONFIRMED");
    }
  }
  close() {
    this.rpc.close();
  }
  stopped() {
    return this.rpc.waitClosed();
  }
}
