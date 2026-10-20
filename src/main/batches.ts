import type { DatabaseSync } from "node:sqlite";
import type { OrchestrationEvent, OrchestrationState } from "../shared.js";
import type { Knowledge } from "./knowledge.js";

export type BatchContext = ReturnType<Knowledge["build"]>;

/** Durable manual-queue journal. Recovery marks work interrupted; it never replays. */
export class Batches {
  constructor(
    private db: DatabaseSync,
    private clock: () => number = Date.now,
  ) {
    if (Number(db.prepare("PRAGMA user_version").get()!.user_version) === 12)
      this.transaction(() =>
        db.exec(`CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,state TEXT NOT NULL,context TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS batches_project ON batches(projectId,createdAt);
      CREATE TABLE IF NOT EXISTS batch_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,batchId TEXT NOT NULL REFERENCES batches(id),kind TEXT NOT NULL,status TEXT NOT NULL,taskId TEXT,runId TEXT,reason TEXT,at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS batch_events_scope ON batch_events(batchId,seq);
      PRAGMA user_version=13;`),
      );
  }
  latest(projectId: string): OrchestrationState | null {
    const row = this.db
      .prepare(
        "SELECT state FROM batches WHERE projectId=? ORDER BY createdAt DESC,rowid DESC LIMIT 1",
      )
      .get(projectId);
    return row ? JSON.parse(String(row.state)) : null;
  }
  context(projectId: string, id: string): BatchContext {
    const row = this.db
      .prepare("SELECT context FROM batches WHERE projectId=? AND id=?")
      .get(projectId, id);
    if (!row) throw Error("BATCH_NOT_FOUND");
    return JSON.parse(String(row.context));
  }
  create(batch: OrchestrationState, context: BatchContext) {
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO batches VALUES(?,?,?,?,?,?)")
        .run(
          batch.id!,
          batch.projectId,
          batch.createdAt!,
          batch.updatedAt!,
          JSON.stringify(batch),
          JSON.stringify(context),
        );
      this.event(batch, "created");
    });
  }
  /** Persist the state and the transition together so the audit trail cannot drift. */
  save(
    batch: OrchestrationState,
    kind: OrchestrationEvent["kind"],
    taskId: string | null = null,
  ) {
    batch.updatedAt = this.clock();
    this.transaction(() => {
      const result = this.db
        .prepare(
          "UPDATE batches SET state=?,updatedAt=? WHERE id=? AND projectId=?",
        )
        .run(
          JSON.stringify(batch),
          batch.updatedAt!,
          batch.id!,
          batch.projectId,
        );
      if (!result.changes) throw Error("BATCH_NOT_FOUND");
      this.event(batch, kind, taskId);
    });
  }
  events(projectId: string, id: string): OrchestrationEvent[] {
    return this.db
      .prepare(
        "SELECT e.seq,e.kind,e.status,e.taskId,e.runId,e.reason,e.at FROM batch_events e JOIN batches b ON b.id=e.batchId WHERE b.projectId=? AND b.id=? ORDER BY e.seq DESC LIMIT 200",
      )
      .all(projectId, id) as unknown as OrchestrationEvent[];
  }
  recover(reason = "APP_INTERRUPTED") {
    for (const row of this.db.prepare("SELECT state FROM batches").all()) {
      const batch: OrchestrationState = JSON.parse(String(row.state));
      if (batch.status !== "running") continue;
      batch.status = "interrupted";
      batch.reason = reason;
      this.save(batch, "interrupted");
    }
  }
  private event(
    batch: OrchestrationState,
    kind: OrchestrationEvent["kind"],
    taskId: string | null = null,
  ) {
    this.db
      .prepare(
        "INSERT INTO batch_events(batchId,kind,status,taskId,runId,reason,at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        batch.id!,
        kind,
        batch.status,
        taskId,
        batch.runId,
        batch.reason,
        this.clock(),
      );
  }
  private transaction(fn: () => void) {
    if (this.db.isTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      fn();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
