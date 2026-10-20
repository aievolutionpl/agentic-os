import { randomUUID } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve, relative, dirname, isAbsolute } from "node:path";
import { RpcProcess, type ProcessSpec } from "./rpc.js";
import type { AgentAdapter, AgentInput, AgentResult } from "./providers.js";
import { text, redact, redactEnds } from "./validate.js";
export function workspaceEdit(cwd: string, locations: unknown): boolean {
  if (!Array.isArray(locations) || !locations.length || locations.length > 100)
    return false;
  try {
    const root = realpathSync.native(cwd);
    return locations.every((location) => {
      if (
        typeof location?.path !== "string" ||
        !location.path ||
        location.path.includes("\0")
      )
        return false;
      const target = resolve(root, location.path),
        rel = relative(root, target);
      if (
        !rel ||
        isAbsolute(rel) ||
        rel
          .split(/[\\/]/)
          .some((p) => p === ".." || p.toLowerCase() === ".git") ||
        (process.platform === "win32" && rel.includes(":"))
      )
        return false;
      let ancestor = target;
      while (!existsSync(ancestor) && ancestor !== dirname(ancestor))
        ancestor = dirname(ancestor);
      const physical = relative(root, realpathSync.native(ancestor));
      if (isAbsolute(physical) || physical.split(/[\\/]/).includes(".."))
        return false;
      return (
        !existsSync(target) ||
        (statSync(target).isFile() && statSync(target).nlink === 1)
      );
    });
  } catch {
    return false;
  }
}
// ACP v1. The selected executable is trusted local code and must enforce its own OS sandbox.
export class AcpAdapter implements AgentAdapter {
  readonly rpc: RpcProcess;
  constructor(
    spec: ProcessSpec,
    private options: {
      authMethod?: string;
      model?: string | null;
      requireModel?: boolean;
    } = {},
  ) {
    this.rpc = new RpcProcess(spec);
  }
  private async authenticate(init: any, timeout = 60000) {
    if (!this.options.authMethod) return;
    if (!init.authMethods?.some((m: any) => m.id === this.options.authMethod))
      throw Error("ACP_AUTH_METHOD_UNAVAILABLE");
    await this.rpc.request(
      "authenticate",
      { methodId: this.options.authMethod },
      timeout,
    );
  }
  async signIn() {
    try {
      const init = await this.rpc.request(
        "initialize",
        {
          protocolVersion: 1,
          clientCapabilities: {},
          clientInfo: { name: "agenting-os", version: "0.4.0" },
        },
        30000,
      );
      await this.authenticate(init, 600000);
    } finally {
      this.close();
      await this.stopped();
    }
  }
  async probe(cwd: string) {
    try {
      const init = await this.rpc.request(
        "initialize",
        {
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
          clientInfo: { name: "agenting-os", version: "0.4.0" },
        },
        15000,
      );
      if (init.protocolVersion !== 1) throw Error("ACP_VERSION_UNSUPPORTED");
      await this.authenticate(init);
      const session = await this.rpc.request(
        "session/new",
        { cwd, mcpServers: [] },
        15000,
      );
      text(session.sessionId);
      return (
        Array.isArray(session.models?.availableModels)
          ? session.models.availableModels
          : []
      )
        .sort(
          (a: any, b: any) =>
            Number(String(b.modelId).startsWith("openai-codex:")) -
            Number(String(a.modelId).startsWith("openai-codex:")),
        )
        .slice(0, 300)
        .map((m: any) => ({
          id: text(m.modelId, 240),
          name: text(m.name ?? m.modelId, 240),
        }));
    } finally {
      this.close();
      await this.stopped();
    }
  }
  async run(input: AgentInput): Promise<AgentResult> {
    if (this.options.requireModel && !this.options.model) {
      this.close();
      await this.stopped();
      throw Error("PROVIDER_MODEL_REQUIRED");
    }
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
        const call = message.params?.toolCall;
        const allowEdit =
          !!sessionId &&
          message.params?.sessionId === sessionId &&
          !input.readOnly &&
          call?.kind === "edit" &&
          workspaceEdit(input.cwd, call.locations);
        const option = message.params?.options?.find((option: any) =>
          allowEdit
            ? option.kind === "allow_once"
            : option.kind === "reject_once" || option.kind === "reject_always",
        );
        this.rpc.respond(message.id, {
          outcome: option
            ? { outcome: "selected", optionId: option.optionId }
            : { outcome: "cancelled" },
        });
      } else this.rpc.reject(message.id);
      input.activity(
        "policy",
        "ACP permission request checked. Only located file edits inside the worktree may be allowed; host file and terminal capabilities are disabled.",
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
      await this.authenticate(init);
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
      if (this.options.model) {
        if (
          !session.models?.availableModels?.some(
            (m: any) => m.modelId === this.options.model,
          )
        )
          throw Error("PROVIDER_MODEL_UNAVAILABLE");
        await this.rpc.request("session/set_model", {
          sessionId,
          modelId: this.options.model,
        });
      }
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
      return {
        threadId: sessionId,
        turnId,
        summary: redactEnds(summary, 8000),
      };
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
