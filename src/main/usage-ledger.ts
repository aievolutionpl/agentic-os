import type { DatabaseSync } from "node:sqlite";
import type { Agent, UsageEntry, UsageSummary } from "../shared.js";

/**
 * One row per agent invocation. Token counts come only from what the official
 * CLI reported for that invocation; when it reported nothing they stay null —
 * unknown is never written as zero. Schema v16.
 */
export class UsageLedger {
  constructor(
    private db: DatabaseSync,
    private clock: () => number = Date.now,
  ) {
    if (Number(db.prepare("PRAGMA user_version").get()!.user_version) !== 15)
      return;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS usage_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,agent TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('implementer','reviewer','chat','master')),projectId TEXT,runId TEXT,outcome TEXT NOT NULL CHECK(outcome IN ('completed','failed','cancelled')),inputTokens INTEGER CHECK(inputTokens IS NULL OR inputTokens>=0),outputTokens INTEGER CHECK(outputTokens IS NULL OR outputTokens>=0),totalTokens INTEGER CHECK(totalTokens IS NULL OR totalTokens>=0),source TEXT NOT NULL CHECK(source IN ('cli-stream','unknown')),paid INTEGER NOT NULL DEFAULT 0,at INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS usage_ledger_at ON usage_ledger(at);
        PRAGMA user_version=16;`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  record(entry: Omit<UsageEntry, "id" | "at" | "source">) {
    const known =
      entry.inputTokens !== null ||
      entry.outputTokens !== null ||
      entry.totalTokens !== null;
    this.db
      .prepare(
        "INSERT INTO usage_ledger(agent,role,projectId,runId,outcome,inputTokens,outputTokens,totalTokens,source,paid,at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        entry.agent,
        entry.role,
        entry.projectId,
        entry.runId,
        entry.outcome,
        entry.inputTokens,
        entry.outputTokens,
        entry.totalTokens,
        known ? "cli-stream" : "unknown",
        entry.paid ? 1 : 0,
        this.clock(),
      );
  }
  recent(limit = 30): UsageEntry[] {
    return this.db
      .prepare("SELECT * FROM usage_ledger ORDER BY id DESC LIMIT ?")
      .all(Math.min(Math.max(1, limit), 200))
      .map((r) => ({
        id: Number(r.id),
        agent: String(r.agent) as Agent,
        role: String(r.role) as UsageEntry["role"],
        projectId: r.projectId == null ? null : String(r.projectId),
        runId: r.runId == null ? null : String(r.runId),
        outcome: String(r.outcome) as UsageEntry["outcome"],
        inputTokens: r.inputTokens == null ? null : Number(r.inputTokens),
        outputTokens: r.outputTokens == null ? null : Number(r.outputTokens),
        totalTokens: r.totalTokens == null ? null : Number(r.totalTokens),
        source: String(r.source) as UsageEntry["source"],
        paid: r.paid === 1,
        at: Number(r.at),
      }));
  }
  /** Per agent since `since`: known totals and how many invocations are unknown. */
  summary(since: number): UsageSummary[] {
    return this.db
      .prepare(
        "SELECT agent, COUNT(*) AS invocations, SUM(source='cli-stream') AS measured, SUM(source='unknown') AS unmeasured, SUM(inputTokens) AS inputTokens, SUM(outputTokens) AS outputTokens, SUM(COALESCE(totalTokens, inputTokens+outputTokens)) AS totalTokens, SUM(paid) AS paid FROM usage_ledger WHERE at>=? GROUP BY agent ORDER BY invocations DESC",
      )
      .all(since)
      .map((r) => ({
        agent: String(r.agent) as Agent,
        invocations: Number(r.invocations),
        measured: Number(r.measured ?? 0),
        unmeasured: Number(r.unmeasured ?? 0),
        // SUM over only-null rows is null: nothing measured stays unknown.
        inputTokens: r.inputTokens == null ? null : Number(r.inputTokens),
        outputTokens: r.outputTokens == null ? null : Number(r.outputTokens),
        totalTokens: r.totalTokens == null ? null : Number(r.totalTokens),
        paid: Number(r.paid ?? 0),
      }));
  }
}

/** Sum the token reports an adapter streams during one invocation. */
export function tokenMeter() {
  let input: number | null = null,
    output: number | null = null,
    total: number | null = null;
  const add = (current: number | null, value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? (current ?? 0) + Math.round(value)
      : current;
  return {
    observe(kind: string, value: string) {
      if (kind !== "tokens") return;
      try {
        const t = JSON.parse(value);
        input = add(input, t?.input);
        output = add(output, t?.output);
        total = add(total, t?.total);
      } catch {
        // A malformed report is not a measurement.
      }
    },
    read: () => ({
      inputTokens: input,
      outputTokens: output,
      totalTokens: total,
    }),
  };
}
