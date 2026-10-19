import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { object } from "./validate.js";

export interface ProcessSpec {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}
export class RpcProcess extends EventEmitter {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private sequence = 0;
  private buffer = "";
  private closing = false;
  private exited = false;
  private exitResolve!: () => void;
  private readonly exitPromise = new Promise<void>((resolve) => {
    this.exitResolve = resolve;
  });
  constructor(spec: ProcessSpec) {
    super();
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|LANG|LC_ALL)$/i.test(
          key,
        ),
      ),
    );
    this.child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: { ...env, ...spec.env },
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.consume(chunk));
    // Provider stderr can contain credentials; drain it without persisting or forwarding it.
    this.child.stderr.on("data", () => {});
    this.child.stdin.on("error", () => {});
    this.child.on("error", () => this.fail("PROVIDER_UNAVAILABLE"));
    this.child.on("close", () => {
      this.exited = true;
      this.exitResolve();
      this.fail("PROVIDER_DISCONNECTED");
      this.emit("closed");
    });
  }
  private consume(chunk: string) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > 2 * 1024 * 1024) {
      this.fail("PROTOCOL_LIMIT");
      this.close();
      return;
    }
    for (let end; (end = this.buffer.indexOf("\n")) >= 0; ) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      try {
        const message = object(JSON.parse(line));
        if (typeof message.method === "string")
          this.emit(
            message.id === undefined ? "notification" : "request",
            message,
          );
        else if (typeof message.id === "number") {
          const pending = this.pending.get(message.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(message.id);
            if (message.error) pending.reject(Error("PROVIDER_REQUEST_FAILED"));
            else pending.resolve(message.result);
          }
        }
      } catch {
        this.fail("PROTOCOL_INVALID");
        this.close();
        return;
      }
    }
  }
  request(method: string, params: unknown = {}, timeout = 30000): Promise<any> {
    if (this.closing) return Promise.reject(Error("PROVIDER_DISCONNECTED"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("PROVIDER_TIMEOUT"));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
      );
    });
  }
  notify(method: string, params: unknown = {}) {
    if (!this.closing)
      this.child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n",
      );
  }
  respond(id: unknown, result: unknown) {
    if (!this.closing)
      this.child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n",
      );
  }
  reject(id: unknown) {
    if (!this.closing)
      this.child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Host policy denied this request" },
        }) + "\n",
      );
  }
  private fail(code: string) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(Error(code));
    }
    this.pending.clear();
    this.emit("disconnect", code);
  }
  close() {
    if (this.closing) return;
    this.closing = true;
    this.fail("PROVIDER_DISCONNECTED");
    if (this.child.pid && process.platform === "win32") {
      const killer = spawn(
        "taskkill",
        ["/pid", String(this.child.pid), "/t", "/f"],
        { shell: false, windowsHide: true, stdio: "ignore" },
      );
      killer.on("error", () => this.child.kill());
    } else if (this.child.pid) {
      const pid = this.child.pid;
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        this.child.kill("SIGTERM");
      }
      const escalation = setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {}
      }, 1000);
      escalation.unref();
    }
    this.child.stdin.destroy();
  }
  async waitClosed(): Promise<boolean> {
    if (this.exited) return true;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.exitPromise.then(() => true),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), 5000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
