import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { get } from "node:http";
import { delimiter, join } from "node:path";
import type {
  ConnectorReason,
  ConnectorState,
  ConnectorStatus,
  QuotaSnapshot,
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
    adapter: "requires-bridge",
    installHint: "npm install -g @anthropic-ai/claude-code",
  },
  {
    kind: "cli",
    id: "gemini",
    name: "Gemini CLI",
    bin: "gemini",
    versionArgs: ["--version"],
    adapter: "planned",
    installHint: "npm install -g @google/gemini-cli",
  },
  {
    kind: "cli",
    id: "hermes",
    name: "Hermes",
    bin: "hermes",
    versionArgs: ["--version"],
    adapter: "planned",
    installHint: "https://github.com/NousResearch/hermes-agent",
  },
  {
    kind: "cli",
    id: "opencode",
    name: "OpenCode",
    bin: "opencode",
    versionArgs: ["--version"],
    adapter: "planned",
    installHint: "npm install -g opencode-ai",
  },
  {
    kind: "cli",
    id: "antigravity",
    name: "Antigravity",
    bin: "agy",
    versionArgs: ["--version"],
    adapter: "none",
    installHint: "https://antigravity.google",
    unverified: true,
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
];

export function versionOf(stdout: string): string | null {
  const firstLine = stdout.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const match = firstLine.match(
    /(?:^|\s)v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)(?:\s|$)/,
  );
  return match?.[1] ?? null;
}

const WIN_EXTENSIONS = [".exe", ".com", ".cmd", ".bat"];

export function resolveOnPath(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  const dirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  const suffixes = platform === "win32" ? WIN_EXTENSIONS : [""];
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
  base: Pick<ConnectorStatus, "id" | "name" | "kind" | "adapter" | "installHint">,
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
    return status(base, observedAt, { ...common, state: "ready", reason: "ok" });
  const reason: ConnectorReason =
    info.auth === "unknown"
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
  return Promise.all(
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
}
