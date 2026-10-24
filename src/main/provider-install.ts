import { resolveOnPath, defaultRunner } from "./connectors.js";
import { exact } from "./validate.js";
import type { Terminals } from "./terminals.js";
import type { Agent, ProviderInstallPlan, TerminalSession } from "../shared.js";

const CATALOG = {
  codex: { binary: "codex", url: "https://learn.chatgpt.com/docs/codex/cli", dependency: "npm", windows: "npm install -g @openai/codex", unix: "npm install -g @openai/codex" },
  claude: { binary: "claude", url: "https://code.claude.com/docs/en/setup", dependency: "", windows: "irm https://claude.ai/install.ps1 | iex", unix: "curl -fsSL https://claude.ai/install.sh | bash" },
  antigravity: { binary: "agy", url: "https://antigravity.google/docs/cli/install/", dependency: "", windows: "irm https://antigravity.google/cli/install.ps1 | iex", unix: "curl -fsSL https://antigravity.google/cli/install.sh | bash" },
} as const;

export function installPlan(agent: Agent, platform = process.platform, resolve = resolveOnPath): ProviderInstallPlan {
  if (!Object.hasOwn(CATALOG, agent)) throw Error("INSTALL_UNSUPPORTED_PROVIDER");
  const spec = CATALOG[agent as keyof typeof CATALOG];
  const supported = ["win32", "darwin", "linux"].includes(platform);
  const dependencies: string[] = spec.dependency ? [spec.dependency, "node"] : platform === "win32" ? [] : ["curl", "bash"];
  const missing = dependencies.filter(name => !resolve(name));
  return { agent, command: platform === "win32" ? spec.windows : spec.unix, url: spec.url,
    platform, missing, ready: supported && !missing.length, executable: resolve(spec.binary) };
}

/** Fixed catalog commands only; the renderer cannot supply shell text. */
export function installShellCommand(command: string, platform = process.platform) {
  if (platform === "win32") return `$ErrorActionPreference = 'Stop'; $global:LASTEXITCODE = 0; try { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + $env:Path; ${command}; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; exit 0 } catch { Write-Error $_; exit 1 }\r`;
  return `bash -o pipefail -c '${command}'; exit $?\r`;
}

export class ProviderInstaller {
  private runs = new Map<Agent, TerminalSession>();
  private starting = new Set<Agent>();
  constructor(private terminals: Terminals) {}
  plan(input: unknown) {
    const p = exact(input, ["agent"]);
    return installPlan(p.agent as Agent);
  }
  login(input: unknown) {
    const p = exact(input, ["agent", "consent"]);
    if (p.consent !== true) throw Error("EXPLICIT_CONSENT_REQUIRED");
    const plan = installPlan(p.agent as Agent);
    if (!plan.executable) throw Error("INSTALL_CLI_MISSING");
    const args = plan.agent === "codex" ? " login" : plan.agent === "claude" ? " auth login" : "";
    // Paths come from local detection, quoted as one literal shell argument.
    const command = process.platform === "win32"
      ? `& '${plan.executable.replace(/'/g, "''")}'${args}`
      : `'${plan.executable.replace(/'/g, "'\\''")}'${args}`;
    const session = this.terminals.open({ consent: true, cols: 100, rows: 18 });
    this.terminals.write({ id: session.id, data: `${command}\r` });
    return session;
  }
  async start(input: unknown) {
    const p = exact(input, ["agent", "consent"]);
    if (p.consent !== true) throw Error("EXPLICIT_CONSENT_REQUIRED");
    const plan = installPlan(p.agent as Agent);
    if (this.starting.has(plan.agent)) throw Error("INSTALL_ALREADY_RUNNING");
    if (!plan.ready) throw Error("INSTALL_DEPENDENCY_MISSING");
    const previous = this.runs.get(plan.agent);
    if (previous && this.terminals.list().some(s => s.id === previous.id && s.state === "running"))
      throw Error("INSTALL_ALREADY_RUNNING");
    this.starting.add(plan.agent);
    try {
    if (previous && this.terminals.list().some(s => s.id === previous.id)) await this.terminals.close({ id: previous.id });
    const session = this.terminals.open({ consent: true, cols: 100, rows: 18 });
    this.runs.set(plan.agent, session);
    this.terminals.write({ id: session.id, data: installShellCommand(plan.command) });
    return session;
    } finally { this.starting.delete(plan.agent); }
  }
  async status(input: unknown) {
    const plan = this.plan(input);
    const previous = this.runs.get(plan.agent);
    const session = previous ? this.terminals.list().find(s => s.id === previous.id) : undefined;
    const finished = !!session && session.state === "exited" && session.exitCode === 0 && !!plan.executable;
    const verified = finished ? await defaultRunner(plan.executable!, ["--version"], 8000) : null;
    return { plan, session: session ?? null, installed: finished && verified?.code === 0 };
  }
}
