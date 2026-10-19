import type { Integration, ProbeState, ProviderProbe } from "../shared.js";
import {
  defaultRunner as shimRunner,
  resolveOnPath,
  versionOf,
} from "./connectors.js";

const TIMEOUT_MS = 8_000;
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

function defaultRunner(
  executable: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<RunResult> {
  // npm-installed CLIs are .cmd shims on Windows; resolve through PATH.
  const path = resolveOnPath(executable);
  if (!path)
    return Promise.resolve({
      code: null,
      stdout: "",
      stderr: "",
      error: "not_found",
    });
  return shimRunner(path, args, timeoutMs);
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
