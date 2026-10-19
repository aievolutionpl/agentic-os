import { spawn } from "node:child_process";
import type { Integration, ProbeState, ProviderProbe } from "../shared.js";

const TIMEOUT_MS = 2_000;
const MAX_CAPTURE = 16_384;
type ProbeKind = "version" | "help" | "authStatus";
type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: "not_found" | "timed_out" | "spawn_failed";
};
type Runner = (
  executable: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<RunResult>;

const SPECS = [
  { id: "codex", name: "Codex", authArgs: ["login", "status"] },
  { id: "claude", name: "Claude Code", authArgs: ["auth", "status"] },
] as const;

function state(result: RunResult): ProbeState {
  if (result.error === "not_found") return "unavailable";
  if (result.error === "timed_out") return "timed_out";
  return result.code === 0 ? "passed" : "failed";
}

function versionOf(stdout: string): string | null {
  const firstLine = stdout.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const match = firstLine.match(
    /(?:^|\s)(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)(?:\s|$)/,
  );
  return match?.[1] ?? null;
}

function defaultRunner(
  executable: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        stdout: stdout.slice(0, MAX_CAPTURE),
        stderr: stderr.slice(0, MAX_CAPTURE),
      });
    };
    const child = spawn(executable, [...args], {
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
        stdout,
        stderr,
        error: error.code === "ENOENT" ? "not_found" : "spawn_failed",
      }),
    );
    child.once("close", (code) => finish({ code, stdout, stderr }));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ code: null, stdout, stderr, error: "timed_out" });
    }, timeoutMs);
  });
}

async function probeProvider(
  spec: (typeof SPECS)[number],
  runner: Runner,
  observedAt: string,
): Promise<Integration> {
  const commands = {
    version: await runner(spec.id, ["--version"], TIMEOUT_MS),
    help: await runner(spec.id, ["--help"], TIMEOUT_MS),
    authStatus: await runner(spec.id, spec.authArgs, TIMEOUT_MS),
  };
  const states = {
    version: state(commands.version),
    help: state(commands.help),
    authStatus: state(commands.authStatus),
  };
  const installation =
    commands.version.error === "not_found"
      ? "not_found"
      : states.version === "passed"
        ? "installed"
        : "unknown";
  const probe: ProviderProbe = {
    installation,
    version:
      states.version === "passed" ? versionOf(commands.version.stdout) : null,
    auth: "unknown",
    provenance: "local-command",
    observedAt,
    commands: states,
    capabilities: {
      version: states.version === "passed",
      help: states.help === "passed",
      authStatus: states.authStatus === "passed",
      execution: false,
    },
  };
  return {
    id: spec.id,
    name: spec.name,
    status: "not_configured",
    probe,
    quota: {
      state: "unknown",
      remaining: null,
      unit: null,
      source: null,
      observedAt: null,
      resetAt: null,
    },
  };
}

export async function probeProviders(
  runner: Runner = defaultRunner,
  now: () => string = () => new Date().toISOString(),
): Promise<Integration[]> {
  const observedAt = now();
  const results: Integration[] = [];
  for (const spec of SPECS)
    results.push(await probeProvider(spec, runner, observedAt));
  return results;
}

export function withProviderProbes(
  integrations: Integration[],
  probes: Integration[],
): Integration[] {
  const byId = new Map(probes.map((probe) => [probe.id, probe]));
  return integrations.map((integration) => {
    const probe = byId.get(integration.id)?.probe;
    return probe ? { ...integration, probe } : integration;
  });
}
