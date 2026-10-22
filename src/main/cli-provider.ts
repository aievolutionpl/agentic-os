import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { AgentAdapter, AgentInput, AgentResult } from "./providers.js";
import type { ProcessSpec } from "./rpc.js";
import { redact, redactEnds } from "./validate.js";

export type NativeProtocol = "claude-cli" | "antigravity-cli";

/** Facts the provider itself reported in its documented stream; never inferred. */
export type ProviderObservation =
  | {
      kind: "limit";
      window: string;
      status: string;
      resetsAt: number | null;
      utilization: number | null;
    }
  | { kind: "tokens"; input: number; output: number; total: number };

const finite = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

/**
 * Claude Code stream-json `rate_limit_event`. Field casing has varied between
 * releases, so both spellings are accepted; anything else is ignored.
 */
export function claudeLimit(event: any): ProviderObservation | null {
  const info = event?.rate_limit_info ?? event?.rateLimitInfo;
  if (!info || typeof info !== "object") return null;
  const window = info.rateLimitType ?? info.rate_limit_type;
  const status = info.status;
  if (typeof window !== "string" || typeof status !== "string") return null;
  const reset = finite(info.resetsAt ?? info.resets_at);
  let utilization = finite(info.utilization);
  // Reported as a 0–1 fraction; treat values above 1 as a percentage.
  if (utilization !== null && utilization > 1) utilization /= 100;
  return {
    kind: "limit",
    window: window.slice(0, 40),
    status: status.slice(0, 40),
    // Seconds or milliseconds since the epoch, normalised to milliseconds.
    resetsAt: reset === null ? null : reset < 1e12 ? reset * 1000 : reset,
    utilization: utilization === null ? null : Math.min(1, utilization),
  };
}
export function cliArguments(
  protocol: NativeProtocol,
  readOnly: boolean,
  threadId?: string | null,
): string[] {
  if (protocol === "antigravity-cli") {
    // A prompt is not a read-only boundary. Do not silently run a reviewer with write tools.
    if (readOnly) throw Error("ANTIGRAVITY_READ_ONLY_UNSUPPORTED");
    if (threadId) throw Error("NATIVE_RESUME_UNSUPPORTED");
    return ["--input-format", "stream-json", "--output-format", "stream-json"];
  }
  const tools = readOnly ? "Read,Glob,Grep" : "Read,Glob,Grep,Edit,Write";
  return [
    "--print",
    "--verbose",
    "--output-format",
    "stream-json",
    "--safe-mode",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--tools",
    tools,
    "--allowedTools",
    tools,
    "--permission-mode",
    "dontAsk",
    ...(threadId ? ["--resume", threadId] : []),
  ];
}

/** Official native CLIs own authentication. No OAuth files or provider stderr are read. */
export class CliAdapter implements AgentAdapter {
  private child?: ChildProcessWithoutNullStreams;
  private closed = true;
  private stopping = false;
  constructor(
    private spec: ProcessSpec,
    private protocol: NativeProtocol,
    private observe: (observation: ProviderObservation) => void = () => {},
  ) {}
  async run(input: AgentInput): Promise<AgentResult> {
    if (input.signal.aborted) throw Error("RUN_CANCELLED");
    const args = cliArguments(this.protocol, input.readOnly, input.threadId);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|LANG|LC_ALL)$/i.test(
          key,
        ),
      ),
    );
    this.child = spawn(this.spec.command, [...this.spec.args, ...args], {
      cwd: input.cwd,
      env: { ...env, ...this.spec.env },
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.closed = false;
    const child = this.child;
    const abort = () => this.close();
    input.signal.addEventListener("abort", abort, { once: true });
    try {
      return await new Promise<AgentResult>((resolve, reject) => {
        let buffer = "",
          bytes = 0,
          // Antigravity streams a response as text_delta fragments per step.
          step = { index: -1, text: "" },
          final: AgentResult | undefined,
          failed = false;
        const turnId = randomUUID();
        const fail = (code: string) => {
          failed = true;
          this.close();
          reject(Error(code));
        };
        child.stdout.setEncoding("utf8");
        child.stderr.on("data", () => {});
        child.stdin.on("error", () => {});
        const consume = (line: string) => {
          if (!line.trim() || failed) return;
          try {
            const event = JSON.parse(line);
            if (
              this.protocol === "claude-cli" &&
              event.type === "rate_limit_event"
            ) {
              const limit = claudeLimit(event);
              if (limit) this.observe(limit);
              return;
            }
            const update =
              event.event === "step_update" ? event.step_update : null;
            if (this.protocol === "antigravity-cli" && update) {
              if (update.step_type === "agent_response") {
                if (update.step_index !== step.index)
                  step = { index: update.step_index, text: "" };
                if (typeof update.text_delta === "string")
                  step.text = (step.text + update.text_delta).slice(-8000);
                if (update.state === "DONE" && step.text.trim())
                  input.activity("message", redact(step.text, 8000));
              } else if (
                update.step_type === "tool" &&
                update.state === "DONE" &&
                typeof update.tool_name === "string"
              )
                input.activity("tool", update.tool_name.slice(0, 100));
              return;
            }
            if (event.type === "assistant") {
              const body = event.message?.content;
              if (Array.isArray(body))
                for (const part of body) {
                  if (part.type === "text" && typeof part.text === "string")
                    input.activity("message", redact(part.text, 8000));
                  if (part.type === "tool_use")
                    input.activity("tool", String(part.name).slice(0, 100));
                }
            }
            const result =
              this.protocol === "claude-cli"
                ? event.type === "result"
                  ? event
                  : null
                : event.event === "result"
                  ? event.result
                  : null;
            if (!result) return;
            if (
              (this.protocol === "claude-cli" &&
                (result.is_error || result.subtype !== "success")) ||
              (this.protocol === "antigravity-cli" &&
                result.status !== "SUCCESS") ||
              (Array.isArray(result.denied_actions) &&
                result.denied_actions.length) ||
              (Array.isArray(result.permission_denials) &&
                result.permission_denials.length)
            )
              return fail("PROVIDER_TURN_INCOMPLETE");
            const id = result.session_id ?? result.conversation_id;
            const summary = result.result ?? result.response;
            if (typeof id !== "string" || !id || typeof summary !== "string")
              return fail("PROTOCOL_INVALID");
            final = {
              threadId: id.slice(0, 240),
              turnId,
              summary: redactEnds(summary, 8000),
            };
            input.session(final.threadId, turnId);
            const usage = result.usage;
            const tokensIn = finite(usage?.input_tokens),
              tokensOut = finite(usage?.output_tokens);
            if (tokensIn !== null && tokensOut !== null) {
              // Antigravity also reports thinking tokens and its own total.
              const total =
                finite(usage.total_tokens) ??
                tokensIn + tokensOut + (finite(usage.thinking_tokens) ?? 0);
              input.activity(
                "tokens",
                JSON.stringify({ input: tokensIn, output: tokensOut, total }),
              );
              this.observe({
                kind: "tokens",
                input: tokensIn,
                output: tokensOut,
                total,
              });
            }
          } catch {
            fail("PROTOCOL_INVALID");
          }
        };
        child.stdout.on("data", (chunk: string) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > 2 * 1024 * 1024) return fail("PROTOCOL_LIMIT");
          buffer += chunk;
          for (let end; (end = buffer.indexOf("\n")) >= 0; ) {
            consume(buffer.slice(0, end));
            buffer = buffer.slice(end + 1);
          }
        });
        child.once("error", () => {
          this.closed = true;
          fail("PROVIDER_UNAVAILABLE");
        });
        child.once("close", (code) => {
          this.closed = true;
          consume(buffer);
          if (input.signal.aborted) reject(Error("RUN_CANCELLED"));
          else if (code === 0 && final && !failed) resolve(final);
          else reject(Error("PROVIDER_TURN_FAILED"));
        });
        child.stdin.end(
          this.protocol === "claude-cli"
            ? input.prompt
            : JSON.stringify({
                event: "user",
                message: { content: input.prompt },
              }) + "\n",
        );
      });
    } finally {
      input.signal.removeEventListener("abort", abort);
      if (!this.closed) this.close();
      if (!(await this.stopped())) throw Error("STOP_UNCONFIRMED");
    }
  }
  close() {
    if (!this.child || this.closed || this.stopping) return;
    this.stopping = true;
    const child = this.child;
    if (child.pid && process.platform === "win32") {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/t", "/f"],
        { shell: false, windowsHide: true, stdio: "ignore" },
      );
      killer.on("error", () => child.kill());
    } else if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill();
      }
      const pid = child.pid;
      const timer = setTimeout(() => {
        if (!this.closed) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch { /* best effort: failure here must not mask the primary result */ }
        }
      }, 1000);
      timer.unref();
    }
    child.stdin.destroy();
  }
  async stopped() {
    const deadline = Date.now() + 5000;
    while (!this.closed && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 25));
    return this.closed;
  }
}
