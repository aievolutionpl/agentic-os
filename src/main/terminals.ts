import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { IPty } from "node-pty";
import type { TerminalSession, TerminalRead } from "../shared.js";
import { exact, text } from "./validate.js";

const BUFFER_LIMIT = 200_000;
const SESSION_LIMIT = 6;
const require = createRequire(import.meta.url);
type Entry = {
  info: TerminalSession;
  pty: IPty;
  buffer: string;
  end: number;
  stopped: Promise<void>;
};
function dimension(value: unknown, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max)
    throw Error("TERMINAL_INVALID_SIZE");
  return Number(value);
}

/** Explicitly opened, user-operated shells. Never used by the agent supervisor. */
export class Terminals {
  private entries = new Map<string, Entry>();
  private closing = false;
  constructor(
    private dataDirectory: string,
    private projectRoot: (id: string) => string,
  ) {}
  list(): TerminalSession[] {
    return [...this.entries.values()].map((entry) => ({ ...entry.info }));
  }
  open(input: unknown): TerminalSession {
    const p = exact(input, ["projectId", "consent", "cols", "rows"]);
    if (p.consent !== true) throw Error("TERMINAL_CONSENT_REQUIRED");
    if (this.closing) throw Error("TERMINAL_CLOSED");
    if (this.entries.size >= SESSION_LIMIT) throw Error("TERMINAL_LIMIT");
    const cols = dimension(p.cols, 20, 300);
    const rows = dimension(p.rows, 5, 100);
    const projectId = p.projectId === undefined ? null : text(p.projectId, 100);
    let cwd: string;
    try {
      if (projectId) {
        const root = this.projectRoot(projectId);
        if (!root) throw Error("TERMINAL_FOLDER_REQUIRED");
        cwd = realpathSync(root);
      } else {
        const root = join(this.dataDirectory, "terminal-workspace");
        mkdirSync(root, { recursive: true });
        cwd = realpathSync(root);
      }
      if (!statSync(cwd).isDirectory()) throw Error("TERMINAL_FOLDER_REQUIRED");
    } catch {
      throw Error("TERMINAL_FOLDER_REQUIRED");
    }
    const windows = process.platform === "win32";
    const shell = windows
      ? join(
          process.env.SystemRoot || "C:\\Windows",
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        )
      : existsSync("/bin/bash")
        ? "/bin/bash"
        : "/bin/sh";
    const env: NodeJS.ProcessEnv = { ...process.env, TERM: "xterm-256color" };
    // Electron's launcher variables must not turn a CLI's Node into Electron.
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    let child: IPty;
    try {
      // A missing native build must fail this terminal request, not app startup.
      const { spawn } = require("node-pty") as typeof import("node-pty");
      child = spawn(shell, windows ? ["-NoLogo"] : ["-i"], {
        name: "xterm-256color",
        cwd,
        env,
        cols,
        rows,
      });
    } catch {
      throw Error("TERMINAL_START_FAILED");
    }
    const info: TerminalSession = {
      id: randomUUID(),
      projectId,
      cwd,
      shell: windows ? "PowerShell" : shell.split("/").pop()!,
      state: "running",
      exitCode: null,
      createdAt: Date.now(),
    };
    let resolveStopped!: () => void;
    const stopped = new Promise<void>((resolve) => {
      resolveStopped = resolve;
    });
    const entry: Entry = { info, pty: child, buffer: "", end: 0, stopped };
    this.entries.set(info.id, entry);
    child.onData((data) => {
      entry.end += data.length;
      entry.buffer = (entry.buffer + data).slice(-BUFFER_LIMIT);
    });
    child.onExit(({ exitCode }) => {
      info.state = "exited";
      info.exitCode = exitCode;
      resolveStopped();
    });
    return { ...info };
  }
  private entry(id: unknown) {
    const entry = this.entries.get(text(id, 100));
    if (!entry) throw Error("TERMINAL_NOT_FOUND");
    return entry;
  }
  read(input: unknown): TerminalRead {
    const p = exact(input, ["id", "cursor"]);
    const entry = this.entry(p.id);
    if (
      !Number.isSafeInteger(p.cursor) ||
      Number(p.cursor) < 0 ||
      Number(p.cursor) > entry.end
    )
      throw Error("TERMINAL_INVALID_CURSOR");
    const start = entry.end - entry.buffer.length;
    const cursor = Math.max(start, Number(p.cursor));
    const data = entry.buffer.slice(cursor - start, cursor - start + 64_000);
    return {
      data,
      cursor: cursor + data.length,
      reset: Number(p.cursor) < start,
      state: entry.info.state,
      exitCode: entry.info.exitCode,
    };
  }
  write(input: unknown): void {
    const p = exact(input, ["id", "data"]);
    const entry = this.entry(p.id);
    if (entry.info.state !== "running") throw Error("TERMINAL_EXITED");
    if (typeof p.data !== "string" || p.data.length > 16_384)
      throw Error("TERMINAL_INPUT_TOO_LARGE");
    entry.pty.write(p.data);
  }
  resize(input: unknown): void {
    const p = exact(input, ["id", "cols", "rows"]);
    const entry = this.entry(p.id);
    const cols = dimension(p.cols, 20, 300),
      rows = dimension(p.rows, 5, 100);
    if (entry.info.state === "running") entry.pty.resize(cols, rows);
  }
  async close(input: unknown): Promise<void> {
    const p = exact(input, ["id"]);
    const entry = this.entry(p.id);
    if (entry.info.state === "running") {
      try {
        entry.pty.kill();
      } catch {
        /* Process may have just exited. */
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        entry.stopped,
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            try {
              entry.pty.kill("SIGKILL");
            } catch {
              /* Already exited. */
            }
            resolve();
          }, 1500);
        }),
      ]);
      clearTimeout(timer);
    }
    this.entries.delete(entry.info.id);
  }
  async dispose(): Promise<void> {
    this.closing = true;
    await Promise.all([...this.entries.keys()].map((id) => this.close({ id })));
  }
}
