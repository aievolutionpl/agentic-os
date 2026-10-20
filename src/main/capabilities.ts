import type { DatabaseSync } from "node:sqlite";
import {
  AGENTS,
  READ_ONLY_AGENTS,
  type Agent,
  type Capability,
  type CapabilityEvidence,
  type ConnectorStatus,
  type ProviderHealth,
  type ProviderSetting,
} from "../shared.js";

const NAMES: Record<Agent, string> = {
  codex: "Codex",
  claude: "Claude Code",
  gemini: "Gemini CLI",
  hermes: "Hermes",
  opencode: "OpenCode",
  local: "Local model",
  antigravity: "Antigravity",
};

/** Durable record of explicit connection checks. A check never runs inference. */
export class CapabilityChecks {
  constructor(private db: DatabaseSync) {
    if (Number(db.prepare("PRAGMA user_version").get()!.user_version) !== 13)
      return;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS capability_checks(agent TEXT PRIMARY KEY,state TEXT NOT NULL,detail TEXT NOT NULL,models INTEGER NOT NULL DEFAULT 0,observedAt TEXT NOT NULL);
        PRAGMA user_version=14;`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  record(health: ProviderHealth) {
    this.db
      .prepare(
        "INSERT INTO capability_checks VALUES(?,?,?,?,?) ON CONFLICT(agent) DO UPDATE SET state=excluded.state,detail=excluded.detail,models=excluded.models,observedAt=excluded.observedAt",
      )
      .run(
        health.agent,
        health.state,
        health.detail.slice(0, 80),
        health.models.length,
        health.observedAt,
      );
    return health;
  }
  list(): CapabilityEvidence["checks"] {
    return this.db
      .prepare("SELECT * FROM capability_checks ORDER BY agent")
      .all()
      .map((row) => ({
        agent: String(row.agent) as Agent,
        state: String(row.state) as ProviderHealth["state"],
        detail: String(row.detail),
        models: Number(row.models),
        observedAt: String(row.observedAt),
      }));
  }
}

/**
 * Separate facts, never merged into one optimistic flag: detected, configured,
 * sign-in (reported by the CLI vs. verified by an explicit check), protocol
 * handshake, and real inference evidenced only by runs that actually finished.
 */
export function capabilityMatrix(
  connectors: ConnectorStatus[],
  settings: ProviderSetting[],
  evidence: CapabilityEvidence,
): Capability[] {
  return AGENTS.map((agent) => {
    const connector = connectors.find((c) => c.id === agent),
      setting = settings.find((s) => s.id === agent),
      // A check only describes a configured profile; a stale one is not evidence.
      check = setting?.configured
        ? (evidence.checks.find((c) => c.agent === agent) ?? null)
        : null,
      runs = evidence.runs.find((r) => r.provider === agent);
    const detected =
      agent === "local" ? !!setting?.configured : !!connector?.installed;
    const configured = !!setting?.configured;
    const auth: Capability["auth"] =
      check?.state === "connected"
        ? "verified"
        : check?.state === "needs-auth" || connector?.auth === "unauthenticated"
          ? "missing"
          : connector?.auth === "authenticated"
            ? "reported"
            : "unknown";
    const handshake: Capability["handshake"] = !check
      ? "not_tested"
      : check.state === "connected"
        ? "passed"
        : "failed";
    const live: Capability["live"] = runs?.lastSuccessAt
      ? "passed"
      : runs?.lastFailureAt
        ? "failed"
        : "not_tested";
    const readOnly = READ_ONLY_AGENTS.includes(agent);
    const roles: Capability["roles"] = [
      "implementer",
      ...(readOnly ? (["reviewer", "master"] as const) : []),
    ];
    const verdict: Capability["verdict"] = !detected
      ? "needs-install"
      : !configured
        ? "needs-connection"
        : auth === "missing"
          ? "needs-auth"
          : handshake === "passed" && live === "passed"
            ? "verified"
            : "unverified";
    return {
      agent,
      name: connector?.name ?? NAMES[agent],
      detected,
      version: connector?.version ?? null,
      configured,
      auth,
      handshake,
      handshakeAt: check?.observedAt ?? null,
      handshakeDetail: check?.detail ?? null,
      live,
      liveAt: runs?.lastSuccessAt ?? runs?.lastFailureAt ?? null,
      successfulRuns: runs?.successes ?? 0,
      roles,
      readOnly,
      models: Math.max(connector?.models.length ?? 0, check?.models ?? 0),
      verdict,
    };
  });
}
