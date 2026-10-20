import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { get } from "node:http";
import { delimiter, join } from "node:path";
import type {
  ConnectorReason,
  ConnectorState,
  ConnectorStatus,
  QuotaSnapshot,
  ProviderSetting,
} from "../shared.js";

const TIMEOUT_MS = 8_000;
const HTTP_TIMEOUT_MS = 1_500;
const MAX_CAPTURE = 16_384;
const MAX_MODELS = 50;

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: "not_found" | "timed_out" | "spawn_failed";
}
export type Runner = (
  file: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<RunResult>;
export type Resolver = (name: string) => string | null;
export type HttpJson = (url: string) => Promise<unknown | null>;

type Spec =
  | {
      kind: "cli";
      id: string;
      name: string;
      bin: string;
      versionArgs: readonly string[];
      authArgs?: readonly string[];
      parseAuth?: (text: string, code: number | null) => AuthInfo;
      adapter: ConnectorStatus["adapter"];
      installHint: string;
      /** Installed but no verified integration path exists yet. */
      unverified?: boolean;
      /** Other agent CLIs: listed only when found, never as an install prompt. */
      optional?: boolean;
    }
  | {
      kind: "local-server";
      id: string;
      name: string;
      bin: string;
      url: string;
      modelsOf: (body: unknown) => string[];
      adapter: ConnectorStatus["adapter"];
      installHint: string;
    }
  | {
      kind: "api";
      id: string;
      name: string;
      installHint: string;
    };

interface AuthInfo {
  auth: ConnectorStatus["auth"];
  account?: string | null;
  authMethod?: string | null;
  plan?: string | null;
}

const NO_QUOTA: QuotaSnapshot = {
  state: "unknown",
  unit: null,
  used: null,
  limit: null,
  remaining: null,
  resetAt: null,
  confidence: "unavailable",
  source: null,
  observedAt: null,
};

// Only fields that are needed are read; email, org ids and paths printed by
// the official CLIs are deliberately discarded.
function parseCodex(text: string, code: number | null): AuthInfo {
  if (code === 0 && /logged in/i.test(text)) {
    const method = text.match(/logged in using ([^\r\n]{1,40})/i)?.[1];
    return { auth: "authenticated", authMethod: method?.trim() ?? null };
  }
  return { auth: code === null ? "unknown" : "unauthenticated" };
}
function parseClaude(text: string, code: number | null): AuthInfo {
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    if (body.loggedIn === true)
      return {
        auth: "authenticated",
        authMethod:
          typeof body.authMethod === "string"
            ? body.authMethod.slice(0, 40)
            : null,
        plan:
          typeof body.subscriptionType === "string"
            ? body.subscriptionType.slice(0, 40)
            : null,
      };
    if (body.loggedIn === false) return { auth: "unauthenticated" };
  } catch {
    // fall through to exit-code interpretation
  }
  return { auth: code === 0 ? "unknown" : "unauthenticated" };
}
function parseGitHub(text: string, code: number | null): AuthInfo {
  const account =
    text.match(/Logged in to \S+ account (\S+)/)?.[1] ??
    text.match(/Logged in to \S+ as (\S+)/)?.[1] ??
    null;
  if (code === 0 && account)
    return { auth: "authenticated", account: account.slice(0, 80) };
  return { auth: code === null ? "unknown" : "unauthenticated" };
}
const ollamaModels = (body: unknown): string[] =>
  Array.isArray((body as { models?: unknown })?.models)
    ? (body as { models: { name?: unknown }[] }).models
        .map((m) => (typeof m?.name === "string" ? m.name : ""))
        .filter(Boolean)
        .slice(0, MAX_MODELS)
    : [];
const openAiModels = (body: unknown): string[] =>
  Array.isArray((body as { data?: unknown })?.data)
    ? (body as { data: { id?: unknown }[] }).data
        .map((m) => (typeof m?.id === "string" ? m.id : ""))
        .filter(Boolean)
        .slice(0, MAX_MODELS)
    : [];

export const SPECS: readonly Spec[] = [
  {
    kind: "cli",
    id: "codex",
    name: "Codex",
    bin: "codex",
    versionArgs: ["--version"],
    authArgs: ["login", "status"],
    parseAuth: parseCodex,
    adapter: "available",
    installHint: "npm install -g @openai/codex",
  },
  {
    kind: "cli",
    id: "claude",
    name: "Claude Code",
    bin: "claude",
    versionArgs: ["--version"],
    authArgs: ["auth", "status"],
    parseAuth: parseClaude,
    adapter: "available",
    installHint: "npm install -g @anthropic-ai/claude-code",
  },
  {
    kind: "cli",
    id: "gemini",
    name: "Gemini CLI",
    bin: "gemini",
    versionArgs: ["--version"],
    adapter: "available",
    installHint: "npm install -g @google/gemini-cli",
  },
  {
    kind: "cli",
    id: "hermes",
    name: "Hermes",
    bin: "hermes",
    versionArgs: ["--version"],
    adapter: "available",
    installHint: "https://github.com/NousResearch/hermes-agent",
  },
  {
    kind: "cli",
    id: "opencode",
    name: "OpenCode",
    bin: "opencode",
    versionArgs: ["--version"],
    adapter: "available",
    installHint: "npm install -g opencode-ai",
  },
  {
    kind: "cli",
    id: "antigravity",
    name: "Antigravity",
    bin: "agy",
    versionArgs: ["--version"],
    adapter: "available",
    installHint: "https://antigravity.google",
  },
  {
    kind: "local-server",
    id: "ollama",
    name: "Ollama",
    bin: "ollama",
    url: "http://127.0.0.1:11434/api/tags",
    modelsOf: ollamaModels,
    adapter: "planned",
    installHint: "https://ollama.com/download",
  },
  {
    kind: "local-server",
    id: "lmstudio",
    name: "LM Studio",
    bin: "lms",
    url: "http://127.0.0.1:1234/v1/models",
    modelsOf: openAiModels,
    adapter: "planned",
    installHint: "https://lmstudio.ai",
  },
  {
    kind: "api",
    id: "api",
    name: "Model APIs",
    installHint: "OpenAI-compatible · Anthropic · Google · OpenRouter",
  },
  {
    kind: "cli",
    id: "github",
    name: "GitHub",
    bin: "gh",
    versionArgs: ["--version"],
    authArgs: ["auth", "status"],
    parseAuth: parseGitHub,
    adapter: "none",
    installHint: "winget install GitHub.cli",
  },
  // Other agent CLIs found on this computer. Detection uses only --version; no
  // adapter exists yet, so they are shown as detected, never as connected.
  ...(
    [
      [
        "cursor-agent",
        "Cursor Agent",
        "cursor-agent",
        "https://cursor.com/cli",
      ],
      [
        "copilot",
        "GitHub Copilot CLI",
        "copilot",
        "https://github.com/features/copilot/cli",
      ],
      ["qwen", "Qwen Code", "qwen", "https://github.com/QwenLM/qwen-code"],
      ["aider", "Aider", "aider", "https://aider.chat"],
      ["goose", "Goose", "goose", "https://block.github.io/goose"],
      ["amp", "Amp", "amp", "https://ampcode.com"],
    ] as const
  ).map(
    ([id, name, bin, installHint]) =>
      ({
        kind: "cli",
        id,
        name,
        bin,
        versionArgs: ["--version"],
        adapter: "planned",
        installHint,
        optional: true,
      }) as const,
  ),
];

export function versionOf(stdout: string): string | null {
  const firstLine = stdout.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const match = firstLine.match(
    /(?:^|\s)v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)(?:\s|$)/,
  );
  return match?.[1] ?? null;
}

const WIN_EXTENSIONS = [".exe", ".com", ".cmd", ".bat"];

/**
 * Documented per-user and package-manager install folders. An app started from the
 * macOS Dock or a Windows shortcut often lacks the shell PATH that holds them.
 * Only folders derived from the given environment are used, so lookups stay
 * deterministic and nothing outside these fixed locations is searched.
 */
export function installDirs(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const home = platform === "win32" ? env.USERPROFILE : env.HOME;
  const dirs: string[] = [];
  const join2 = (...parts: (string | undefined)[]) =>
    parts.every(Boolean) ? join(...(parts as string[])) : null;
  if (platform === "win32") {
    dirs.push(
      ...[
        join2(home, ".local", "bin"), // Claude Code native installer
        join2(env.LOCALAPPDATA, "agy", "bin"), // Antigravity CLI installer
        join2(env.APPDATA, "npm"),
        join2(env.LOCALAPPDATA, "pnpm"),
        join2(home, ".bun", "bin"),
        join2(home, ".opencode", "bin"),
        join2(home, "scoop", "shims"),
        join2(env.LOCALAPPDATA, "Microsoft", "WinGet", "Links"),
        join2(env.LOCALAPPDATA, "hermes", "bin"),
      ].filter((d): d is string => !!d),
    );
  } else {
    const nvm = join2(home, ".nvm", "versions", "node");
    let nodes: string[] = [];
    if (nvm)
      try {
        // Newest installed Node first, where global npm CLIs live under nvm.
        nodes = readdirSync(nvm)
          .filter((v) => /^v\d+\.\d+\.\d+$/.test(v))
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
          .map((v) => join(nvm, v, "bin"));
      } catch {
        // nvm not installed
      }
    dirs.push(
      ...[
        join2(home, ".local", "bin"), // Claude Code and Antigravity CLI installers
        join2(home, ".claude", "local"),
        join2(home, ".opencode", "bin"),
        join2(home, ".npm-global", "bin"),
        join2(home, ".bun", "bin"),
        join2(home, ".volta", "bin"),
        join2(home, ".cargo", "bin"),
        join2(home, ".local", "share", "pnpm"),
        join2(home, "Library", "pnpm"),
        join2(home, "bin"),
      ].filter((d): d is string => !!d),
      ...nodes,
      "/opt/homebrew/bin",
      "/usr/local/bin",
    );
  }
  return dirs;
}

export function resolveOnPath(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  options: { native?: boolean } = {},
): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  const path = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  const dirs = [...new Set([...path, ...installDirs(env, platform)])];
  // native: skip .cmd/.bat shims, which cannot be spawned without a shell.
  const suffixes =
    platform === "win32"
      ? options.native
        ? [".exe", ".com"]
        : WIN_EXTENSIONS
      : [""];
  for (const dir of dirs)
    for (const suffix of suffixes) {
      const candidate = join(dir, name + suffix);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // not here
      }
    }
  return null;
}

export const defaultRunner: Runner = (file, args, timeoutMs) =>
  new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: Omit<RunResult, "stdout" | "stderr">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        stdout: stdout.slice(0, MAX_CAPTURE),
        stderr: stderr.slice(0, MAX_CAPTURE),
      });
    };
    // Arguments come only from the constant specs above.
    if (!args.every((arg) => /^[\w.-]+$/.test(arg)))
      return resolve({ code: null, stdout, stderr, error: "spawn_failed" });
    const shim = process.platform === "win32" && /\.(cmd|bat)$/i.test(file);
    if (shim && /["&|<>^%\r\n]/.test(file))
      return resolve({ code: null, stdout, stderr, error: "spawn_failed" });
    const child = shim
      ? spawn(
          process.env.ComSpec ?? "cmd.exe",
          ["/d", "/s", "/c", `"${file}" ${args.join(" ")}`],
          {
            shell: false,
            windowsHide: true,
            windowsVerbatimArguments: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        )
      : spawn(file, [...args], {
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length < MAX_CAPTURE) stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < MAX_CAPTURE) stderr += chunk;
    });
    child.once("error", (error: NodeJS.ErrnoException) =>
      finish({
        code: null,
        error: error.code === "ENOENT" ? "not_found" : "spawn_failed",
      }),
    );
    child.once("close", (code) => finish({ code }));
    const timer = setTimeout(() => {
      child.kill();
      finish({ code: null, error: "timed_out" });
    }, timeoutMs);
  });

/** Loopback-only JSON probe with a hard size and time limit. */
export const defaultHttpJson: HttpJson = (url) =>
  new Promise((resolve) => {
    const target = new URL(url);
    if (target.hostname !== "127.0.0.1") return resolve(null);
    const request = get(
      url,
      { timeout: HTTP_TIMEOUT_MS, agent: false },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          return resolve(null);
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 262_144) {
            request.destroy();
            resolve(null);
          }
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
        response.on("error", () => resolve(null));
      },
    );
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
  });

function status(
  base: Pick<
    ConnectorStatus,
    "id" | "name" | "kind" | "adapter" | "installHint"
  >,
  observedAt: string,
  patch: Partial<ConnectorStatus> & {
    state: ConnectorState;
    reason: ConnectorReason;
  },
): ConnectorStatus {
  return {
    ...base,
    installed: false,
    path: null,
    version: null,
    auth: "not-applicable",
    account: null,
    authMethod: null,
    plan: null,
    models: [],
    quota: NO_QUOTA,
    observedAt,
    ...patch,
  };
}

async function scanCli(
  spec: Extract<Spec, { kind: "cli" }>,
  deps: Deps,
  observedAt: string,
): Promise<ConnectorStatus> {
  const base = {
    id: spec.id,
    name: spec.name,
    kind: "cli" as const,
    adapter: spec.adapter,
    installHint: spec.installHint,
  };
  const path = deps.resolve(spec.bin);
  if (!path)
    return status(base, observedAt, {
      state: "needs-install",
      reason: "not_found",
    });
  const versionRun = await deps.run(path, spec.versionArgs, TIMEOUT_MS);
  if (versionRun.error || versionRun.code !== 0)
    return status(base, observedAt, {
      state: "degraded",
      reason: "probe_failed",
      installed: true,
      path,
    });
  const version = versionOf(versionRun.stdout);
  let info: AuthInfo = { auth: "unknown" };
  if (spec.authArgs && spec.parseAuth) {
    const authRun = await deps.run(path, spec.authArgs, TIMEOUT_MS);
    info = authRun.error
      ? { auth: "unknown" }
      : spec.parseAuth(authRun.stdout + "\n" + authRun.stderr, authRun.code);
  }
  const common = {
    installed: true,
    path,
    version,
    auth: info.auth,
    account: info.account ?? null,
    authMethod: info.authMethod ?? null,
    plan: info.plan ?? null,
  };
  if (spec.id === "github")
    return status(base, observedAt, {
      ...common,
      state: info.auth === "authenticated" ? "ready" : "needs-auth",
      reason: info.auth === "authenticated" ? "ok" : "auth_missing",
    });
  if (info.auth === "unauthenticated")
    return status(base, observedAt, {
      ...common,
      state: "needs-auth",
      reason: "auth_missing",
    });
  if (spec.unverified)
    return status(base, observedAt, {
      ...common,
      state: "unsupported",
      reason: "no_verified_integration",
    });
  if (spec.adapter === "available" && info.auth === "authenticated")
    return status(base, observedAt, {
      ...common,
      state: "ready",
      reason: "ok",
    });
  const reason: ConnectorReason =
    spec.adapter === "planned"
      ? "adapter_planned"
      : info.auth === "unknown"
        ? "auth_unknown"
        : spec.adapter === "requires-bridge"
          ? "bridge_required"
          : "adapter_planned";
  return status(base, observedAt, { ...common, state: "experimental", reason });
}

async function scanServer(
  spec: Extract<Spec, { kind: "local-server" }>,
  deps: Deps,
  observedAt: string,
): Promise<ConnectorStatus> {
  const base = {
    id: spec.id,
    name: spec.name,
    kind: "local-server" as const,
    adapter: spec.adapter,
    installHint: spec.installHint,
  };
  const path = deps.resolve(spec.bin);
  const body = await deps.http(spec.url);
  if (body !== null) {
    const models = spec.modelsOf(body);
    return status(base, observedAt, {
      installed: true,
      path,
      models,
      state: "experimental",
      reason: "adapter_planned",
    });
  }
  return path
    ? status(base, observedAt, {
        installed: true,
        path,
        state: "degraded",
        reason: "server_down",
      })
    : status(base, observedAt, { state: "needs-install", reason: "not_found" });
}

export interface Deps {
  run: Runner;
  resolve: Resolver;
  http: HttpJson;
}

/** Detection and a configured execution profile are different facts. */
export function withExecutionSettings(
  connectors: ConnectorStatus[],
  settings: ProviderSetting[],
  routerConfigured = false,
): ConnectorStatus[] {
  return connectors.map((c) => {
    if (c.id === "api")
      return {
        ...c,
        id: "openrouter",
        name: "OpenRouter",
        installHint: "OpenRouter API + OpenCode ACP",
        adapter: "available",
        installed: routerConfigured,
        auth: routerConfigured ? "unknown" : "unauthenticated",
        state: routerConfigured ? "experimental" : "needs-auth",
        reason: routerConfigured ? "auth_unknown" : "auth_missing",
      };
    if (c.adapter !== "available") return c;
    const setting = settings.find((s) => s.id === c.id);
    if (!setting?.configured)
      return c.installed
        ? { ...c, state: "experimental", reason: "connection_required" }
        : c;
    if (setting.id === "codex" && setting.profile !== "existing")
      return {
        ...c,
        installed: true,
        path: setting.command,
        state: "experimental",
        auth: "unknown",
        reason: "auth_unknown",
        authMethod: null,
        plan: null,
      };
    if (
      !c.installed ||
      setting.command !== c.path ||
      setting.protocol === "acp"
    )
      return {
        ...c,
        installed: true,
        path: setting.command,
        state: "experimental",
        auth: "unknown",
        reason: "auth_unknown",
        authMethod: null,
        plan: null,
      };
    return c;
  });
}

/**
 * Fold the latest recorded connection check into the scan, so every screen
 * reports the same state as Connections. Only configured runtimes carry checks
 * (saving a setup clears its check); a check proves the handshake, and sign-in
 * only when its detail says it was verified.
 */
export function withCheckEvidence(
  connectors: ConnectorStatus[],
  checks: { agent: string; state: string; detail: string }[],
): ConnectorStatus[] {
  return connectors.map((c) => {
    const check = checks.find((k) => k.agent === c.id);
    if (
      !check ||
      c.adapter !== "available" ||
      !c.installed ||
      c.reason === "connection_required" ||
      // A failure observed by this scan outranks an older successful check.
      c.state === "degraded" ||
      c.auth === "unauthenticated"
    )
      return c;
    if (check.state === "connected")
      return {
        ...c,
        state: "ready",
        reason: "ok",
        auth: /_VERIFIED$|_MODELS_READY$/.test(check.detail)
          ? "authenticated"
          : c.auth,
      };
    if (check.state === "needs-auth")
      return {
        ...c,
        state: "needs-auth",
        reason: "auth_missing",
        auth: "unauthenticated",
      };
    return { ...c, state: "degraded", reason: "probe_failed" };
  });
}

export async function scanConnectors(
  deps: Partial<Deps> = {},
  now: () => string = () => new Date().toISOString(),
): Promise<ConnectorStatus[]> {
  const resolved: Deps = {
    run: deps.run ?? defaultRunner,
    resolve: deps.resolve ?? ((name) => resolveOnPath(name)),
    http: deps.http ?? defaultHttpJson,
  };
  const observedAt = now();
  const scanned = await Promise.all(
    SPECS.map((spec) => {
      if (spec.kind === "cli") return scanCli(spec, resolved, observedAt);
      if (spec.kind === "local-server")
        return scanServer(spec, resolved, observedAt);
      return Promise.resolve(
        status(
          {
            id: spec.id,
            name: spec.name,
            kind: "api",
            adapter: "planned",
            installHint: spec.installHint,
          },
          observedAt,
          { state: "unsupported", reason: "vault_missing" },
        ),
      );
    }),
  );
  return scanned.filter(
    (c, i) =>
      !(
        SPECS[i]!.kind === "cli" &&
        (SPECS[i] as { optional?: boolean }).optional
      ) || c.installed,
  );
}
