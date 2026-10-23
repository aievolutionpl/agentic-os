import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { LimitBridgeStatus } from "../shared.js";
import { exact } from "./validate.js";

/** CLIs whose own status line hands a running session's quota to a command. */
export const BRIDGE_AGENTS = ["claude", "antigravity"] as const;
export type BridgeAgent = (typeof BRIDGE_AGENTS)[number];

export interface ClaudeWindow {
  usedPercent: number;
  resetsAt: number;
  usedUsd?: number;
  limitUsd?: number;
  period?: string;
}
export interface ClaudeReading {
  at: number;
  windows: Record<string, ClaudeWindow>;
}
export interface AntigravityBucket {
  remainingFraction: number;
  resetsAt: number | null;
}
export interface AntigravityReading {
  at: number;
  plan: string | null;
  buckets: Record<string, AntigravityBucket>;
}
export interface BridgeReadings {
  claude?: ClaudeReading;
  antigravity?: AntigravityReading;
}

/**
 * Relay run by the CLI on every status line render. It reads the JSON the CLI
 * pipes on stdin, keeps only the quota fields (never e-mail, paths or
 * prompts), stores them next to itself and prints a status line: the user's
 * previous command when there was one, otherwise a short summary.
 */
const RELAY = String.raw`// Agenting OS limit relay. Generated; safe to delete with "Disconnect".
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const agent = process.argv[2] === "antigravity" ? "antigravity" : "claude";
const num = (v, max) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
function readStdin() {
  return new Promise((resolve) => {
    let raw = "";
    const done = () => resolve(raw);
    setTimeout(done, 1500).unref();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => { if (raw.length < 1048576) raw += c; });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
  });
}
function pick(j) {
  if (agent === "claude") {
    const windows = {};
    for (const [id, w] of Object.entries(j?.rate_limits ?? {}).slice(0, 10)) {
      if (!/^[a-z0-9_]{1,40}$/.test(id)) continue;
      const used = num(w?.used_percentage, 1000), reset = num(w?.resets_at, 1e11);
      if (used === null || reset === null) continue;
      windows[id] = { usedPercent: used, resetsAt: reset * 1000 };
      const usd = num(w?.used_usd, 1e9), cap = num(w?.limit_usd, 1e9);
      if (usd !== null && cap !== null) Object.assign(windows[id], { usedUsd: usd, limitUsd: cap });
      if (typeof w?.period === "string") windows[id].period = w.period.slice(0, 20);
    }
    return Object.keys(windows).length ? { at: Date.now(), windows } : null;
  }
  const buckets = {};
  for (const [id, q] of Object.entries(j?.quota ?? {}).slice(0, 20)) {
    if (!/^[A-Za-z0-9._:-]{1,80}$/.test(id)) continue;
    const rest = num(q?.remaining_fraction, 1);
    if (rest === null || q?.disabled === true) continue;
    const reset = typeof q?.reset_time === "string" ? Date.parse(q.reset_time)
      : num(q?.reset_in_seconds, 1e9) !== null ? Date.now() + q.reset_in_seconds * 1000 : NaN;
    buckets[id] = { remainingFraction: rest, resetsAt: Number.isFinite(reset) ? reset : null };
  }
  if (!Object.keys(buckets).length) return null;
  const plan = typeof j?.plan_tier === "string" ? j.plan_tier.slice(0, 40) : null;
  return { at: Date.now(), plan, buckets };
}
function summary(r) {
  if (!r) return "";
  if (agent === "claude")
    return Object.entries(r.windows).map(([id, w]) =>
      (id === "five_hour" ? "5h" : id === "seven_day" ? "7d" : id.replace(/_/g, " ")) + " " + Math.round(w.usedPercent) + "%").join(" · ");
  return Object.entries(r.buckets).map(([id, b]) => id + " " + Math.round(b.remainingFraction * 100) + "% left").join(" · ");
}
function previous() {
  try {
    const p = JSON.parse(readFileSync(join(here, agent + ".json"), "utf8")).previous;
    return p && p.enabled !== false ? p.command ?? null : null;
  } catch { return null; }
}
const raw = await readStdin();
let reading = null;
try { reading = pick(JSON.parse(raw)); } catch { /* best effort: failure here must not mask the primary result */ }
if (reading) {
  try {
    const file = join(here, agent + "-limits.json");
    writeFileSync(file + ".tmp", JSON.stringify(reading), { mode: 0o600 });
    renameSync(file + ".tmp", file);
  } catch { /* best effort: failure here must not mask the primary result */ }
}
// The previous command was written for the shell the CLI uses: on Windows
// that is Git Bash when installed and PowerShell otherwise, never cmd.exe.
function shellFor(command) {
  if (process.platform !== "win32") return ["/bin/sh", ["-c", command]];
  const bash = [
    process.env.CLAUDE_CODE_GIT_BASH_PATH,
    process.env.ProgramFiles && join(process.env.ProgramFiles, "Git", "bin", "bash.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"),
  ].find((p) => p && existsSync(p));
  return bash
    ? [bash, ["-c", command]]
    : ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command]];
}
const chained = previous();
if (typeof chained === "string" && chained) {
  // The shell may start further processes that keep the pipe open, so the
  // cap kills the whole tree and finishes the relay itself.
  const win = process.platform === "win32";
  const child = spawn(...shellFor(chained), { detached: !win, stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
  let out = "", finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(stop);
    process.stdout.write(out, () => process.exit(0));
  };
  const stop = setTimeout(() => {
    try {
      if (win) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      else process.kill(-child.pid, "SIGKILL");
    } catch { child.kill(); }
    finish();
  }, 3000);
  child.stdout.on("data", (c) => { out += c; });
  child.on("error", finish);
  child.on("close", finish);
  child.stdin.on("error", () => {});
  child.stdin.end(raw);
} else process.stdout.write(summary(reading));
`;

/** A POSIX shell literal: nothing inside is expanded. */
const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

type StatusLine = { command?: unknown; [key: string]: unknown };
type Settings = { statusLine?: StatusLine; [key: string]: unknown };

/**
 * Optional, explicitly consented link to a CLI's documented status line.
 * Installing adds one `statusLine` entry to that CLI's own settings file
 * (keeping only the previous entry), chaining any command already there;
 * removing restores it.
 * Nothing reads credentials, and the CLI keeps its own authentication.
 */
export class LimitBridge {
  private dir: string;
  constructor(
    dataDirectory: string,
    private runtime: string = process.execPath,
    private env: NodeJS.ProcessEnv = process.env,
    private home: string = homedir(),
    private platform: NodeJS.Platform = process.platform,
  ) {
    this.dir = join(dataDirectory, "limit-bridge");
  }
  settingsPath(agent: BridgeAgent) {
    return agent === "claude"
      ? join(
          this.env.CLAUDE_CONFIG_DIR || join(this.home, ".claude"),
          "settings.json",
        )
      : join(this.home, ".gemini", "antigravity-cli", "settings.json");
  }
  private wrapper() {
    return join(this.dir, this.platform === "win32" ? "relay.ps1" : "relay.sh");
  }
  /** The exact command written into CLI settings. Encoding keeps Windows
   * shell/argv parsing from splitting quoted paths at spaces. */
  command(agent: BridgeAgent) {
    if (this.platform !== "win32")
      return `${shellQuote(this.wrapper())} ${agent}`;
    const path = this.wrapper().replace(/\\/g, "/");
    // A single encoded argument survives both shell execution and Windows
    // argv splitting, including spaces/non-ASCII characters in the profile.
    const script = `& '${path.replace(/'/g, "''")}' '${agent}'`;
    return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(script, "utf16le").toString("base64")}`;
  }
  private read(agent: BridgeAgent): Settings {
    const path = this.settingsPath(agent);
    if (!existsSync(path)) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      // A file the CLI may still understand is never overwritten blindly.
      throw Error("BRIDGE_SETTINGS_UNREADABLE");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw Error("BRIDGE_SETTINGS_UNREADABLE");
    return parsed as Settings;
  }
  private write(agent: BridgeAgent, settings: Settings) {
    // A dotfile-managed (symlinked) settings file is updated at its target,
    // so the link itself survives.
    const link = this.settingsPath(agent);
    const path = existsSync(link) ? realpathSync(link) : link;
    mkdirSync(dirname(path), { recursive: true });
    // The file keeps its own permissions (it may hold secrets); a new one is
    // private to the user.
    const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o600;
    writeFileSync(
      path + ".agenting.tmp",
      JSON.stringify(settings, null, 2) + "\n",
      { mode },
    );
    chmodSync(path + ".agenting.tmp", mode);
    renameSync(path + ".agenting.tmp", path);
  }
  private ours(settings: Settings, agent: BridgeAgent) {
    return settings.statusLine?.command === this.command(agent);
  }
  status(agent: BridgeAgent): LimitBridgeStatus {
    const settingsPath = this.settingsPath(agent);
    let installed = false,
      readable = true,
      previous: string | null = null;
    try {
      const settings = this.read(agent);
      installed = this.ours(settings, agent);
      const current = settings.statusLine?.command;
      previous = installed
        ? this.previous(agent)
        : typeof current === "string"
          ? current.slice(0, 500)
          : null;
    } catch {
      readable = false;
    }
    const reading = this.readings()[agent];
    return {
      agent,
      settingsPath,
      command: this.command(agent),
      installed,
      readable,
      previous,
      lastReadingAt: reading?.at ?? null,
    };
  }
  private previous(agent: BridgeAgent): string | null {
    try {
      const saved = JSON.parse(
        readFileSync(join(this.dir, `${agent}.json`), "utf8"),
      );
      return typeof saved?.previous?.command === "string"
        ? saved.previous.command.slice(0, 500)
        : null;
    } catch {
      return null;
    }
  }
  private files() {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, "relay.mjs"), RELAY);
    if (this.platform === "win32") {
      const quote = (v: string) => `'${v.replace(/'/g, "''")}'`;
      writeFileSync(
        this.wrapper(),
        [
          "$ErrorActionPreference = 'SilentlyContinue'",
          "$env:ELECTRON_RUN_AS_NODE = '1'",
          "$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false",
          "$raw = [Console]::In.ReadToEnd()",
          `$raw | & ${quote(this.runtime)} ${quote(join(this.dir, "relay.mjs"))} @args`,
          "",
        ].join("\r\n"),
      );
    } else {
      writeFileSync(
        this.wrapper(),
        `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${shellQuote(this.runtime)} ${shellQuote(join(this.dir, "relay.mjs"))} "$@"\n`,
      );
      chmodSync(this.wrapper(), 0o755);
    }
  }
  /** Rewrites the relay files for linked CLIs, e.g. after an app update. */
  refresh() {
    let linked = false;
    for (const agent of BRIDGE_AGENTS) {
      try {
        const settings = this.read(agent);
        const legacy = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${this.wrapper().replace(/\\/g, "/")}" ${agent}`;
        if (this.platform === "win32" && settings.statusLine?.command === legacy) {
          settings.statusLine.command = this.command(agent);
          this.write(agent, settings);
        }
        linked ||= this.ours(settings, agent);
      } catch { /* One malformed CLI config must not disable the other relay. */ }
    }
    if (linked) {
      try { this.files(); } catch { /* Keep the CLI's own execution independent. */ }
    }
  }
  install(input: unknown): LimitBridgeStatus {
    const p = exact(input, ["agent", "consent"]);
    if (p.consent !== true) throw Error("EXPLICIT_CONSENT_REQUIRED");
    const agent = bridgeAgent(p.agent);
    const settings = this.read(agent);
    this.files();
    if (!this.ours(settings, agent)) {
      // Only the statusLine entry is kept for restore: the rest of the file
      // may hold credentials (env), which are never copied.
      const previous =
        settings.statusLine && typeof settings.statusLine.command === "string"
          ? settings.statusLine
          : null;
      writeFileSync(
        join(this.dir, `${agent}.json`),
        JSON.stringify({ previous, installedAt: Date.now() }),
        { mode: 0o600 },
      );
      // A suspended (enabled: false) entry would never call the relay; the
      // original object, flag included, comes back on unlink.
      const { command: _command, enabled: _enabled, ...kept } = previous ?? {};
      settings.statusLine = {
        ...kept,
        type: "command",
        command: this.command(agent),
        // Antigravity can keep its built-in line under ours.
        ...(agent === "antigravity" &&
          !previous && { stack_with_default: true }),
      };
      this.write(agent, settings);
    }
    return this.status(agent);
  }
  remove(input: unknown): LimitBridgeStatus {
    const p = exact(input, ["agent"]);
    const agent = bridgeAgent(p.agent);
    const settings = this.read(agent);
    if (this.ours(settings, agent)) {
      let previous: StatusLine | null = null;
      try {
        previous = JSON.parse(
          readFileSync(join(this.dir, `${agent}.json`), "utf8"),
        ).previous;
      } catch { /* best effort: failure here must not mask the primary result */ }
      if (previous && typeof previous.command === "string")
        settings.statusLine = previous;
      else delete settings.statusLine;
      this.write(agent, settings);
    }
    rmSync(join(this.dir, `${agent}.json`), { force: true });
    rmSync(join(this.dir, `${agent}-limits.json`), { force: true });
    return this.status(agent);
  }
  /** Latest validated readings; anything malformed is ignored. */
  readings(): BridgeReadings {
    const load = (agent: BridgeAgent) => {
      try {
        return JSON.parse(
          readFileSync(join(this.dir, `${agent}-limits.json`), "utf8"),
        );
      } catch {
        return null;
      }
    };
    const out: BridgeReadings = {};
    const finite = (v: unknown, max: number): v is number =>
      typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
    const claude = load("claude");
    if (claude && finite(claude.at, 1e14) && claude.windows) {
      const windows: Record<string, ClaudeWindow> = {};
      for (const [id, w] of Object.entries<any>(claude.windows).slice(0, 10))
        if (
          /^[a-z0-9_]{1,40}$/.test(id) &&
          finite(w?.usedPercent, 1000) &&
          finite(w?.resetsAt, 1e14)
        )
          windows[id] = {
            usedPercent: w.usedPercent,
            resetsAt: w.resetsAt,
            ...(finite(w.usedUsd, 1e9) &&
              finite(w.limitUsd, 1e9) && {
                usedUsd: w.usedUsd,
                limitUsd: w.limitUsd,
              }),
            ...(typeof w.period === "string" && {
              period: w.period.slice(0, 20),
            }),
          };
      if (Object.keys(windows).length) out.claude = { at: claude.at, windows };
    }
    const agy = load("antigravity");
    if (agy && finite(agy.at, 1e14) && agy.buckets) {
      const buckets: Record<string, AntigravityBucket> = {};
      for (const [id, b] of Object.entries<any>(agy.buckets).slice(0, 20))
        if (
          /^[A-Za-z0-9._:-]{1,80}$/.test(id) &&
          finite(b?.remainingFraction, 1)
        )
          buckets[id] = {
            remainingFraction: b.remainingFraction,
            resetsAt: finite(b.resetsAt, 1e14) ? b.resetsAt : null,
          };
      if (Object.keys(buckets).length)
        out.antigravity = {
          at: agy.at,
          plan: typeof agy.plan === "string" ? agy.plan.slice(0, 40) : null,
          buckets,
        };
    }
    return out;
  }
}

export function bridgeAgent(value: unknown): BridgeAgent {
  if (!BRIDGE_AGENTS.includes(value as BridgeAgent))
    throw Error("INVALID_INPUT");
  return value as BridgeAgent;
}
