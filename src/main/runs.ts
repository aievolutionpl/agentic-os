import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { redact } from "./validate.js";
import type { LocalUsage, Run, RunEvent, RunState } from "../shared.js";
import type { Workspace } from "./git.js";
import type { ReviewEvidence } from "./review-evidence.js";
export class Runs {
  constructor(
    private db: DatabaseSync,
    private clock: () => number = Date.now,
  ) {
    const version = Number(
      db.prepare("PRAGMA user_version").get()!.user_version,
    );
    if (version === 5)
      db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE runs(id TEXT PRIMARY KEY,projectId TEXT NOT NULL,taskId TEXT NOT NULL,attempt INTEGER NOT NULL,state TEXT NOT NULL,provider TEXT NOT NULL,reviewer TEXT NOT NULL,repository TEXT NOT NULL,worktree TEXT NOT NULL,base TEXT NOT NULL,head TEXT NOT NULL,threadId TEXT,turnId TEXT,artifactId TEXT,reviewState TEXT NOT NULL DEFAULT 'not_run',reviewText TEXT NOT NULL DEFAULT '',summary TEXT NOT NULL DEFAULT '',error TEXT,approvalId TEXT,previousRunId TEXT,context TEXT NOT NULL DEFAULT '',createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,FOREIGN KEY(projectId,taskId) REFERENCES tasks(projectId,id));
      CREATE INDEX runs_scope ON runs(projectId,taskId,createdAt);
      CREATE UNIQUE INDEX run_attempt ON runs(taskId,attempt);
      CREATE TABLE run_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,runId TEXT NOT NULL REFERENCES runs(id),kind TEXT NOT NULL,text TEXT NOT NULL,at INTEGER NOT NULL);
      CREATE TABLE provider_settings(id TEXT PRIMARY KEY,command TEXT NOT NULL,args TEXT NOT NULL,protocol TEXT NOT NULL,consent INTEGER NOT NULL DEFAULT 0);
      PRAGMA user_version=6;COMMIT;`);
  }
  create(
    projectId: string,
    taskId: string,
    attempt: number,
    provider: string,
    reviewer: string,
    workspace: Workspace,
    context: string,
    previousRunId: string | null = null,
  ): Run {
    const id = randomUUID(),
      now = this.clock();
    this.db
      .prepare(
        `INSERT INTO runs(id,projectId,taskId,attempt,state,provider,reviewer,repository,worktree,base,head,context,previousRunId,createdAt,updatedAt) VALUES(?,?,?,?,'preparing',?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        projectId,
        taskId,
        attempt,
        provider,
        reviewer,
        workspace.repository,
        workspace.path,
        workspace.base,
        workspace.head,
        context,
        previousRunId,
        now,
        now,
      );
    return this.get(projectId, id)!;
  }
  get(projectId: string, id: string): Run | null {
    const row = this.db
      .prepare("SELECT * FROM runs WHERE projectId=? AND id=?")
      .get(projectId, id);
    if (!row) return null;
    const { context, ...publicRow } = row;
    return publicRow as unknown as Run;
  }
  context(id: string) {
    return String(
      this.db.prepare("SELECT context FROM runs WHERE id=?").get(id)?.context ??
        "",
    );
  }
  list(projectId: string, taskId?: string): Run[] {
    return this.db
      .prepare(
        `SELECT id FROM runs WHERE projectId=? ${taskId ? "AND taskId=?" : ""} ORDER BY createdAt DESC,rowid DESC LIMIT 100`,
      )
      .all(...(taskId ? [projectId, taskId] : [projectId]))
      .map((row) => this.get(projectId, String(row.id))!);
  }
  update(projectId: string, id: string, patch: Partial<Run>) {
    const allowed = [
      "state",
      "head",
      "threadId",
      "turnId",
      "artifactId",
      "reviewState",
      "reviewText",
      "summary",
      "error",
      "approvalId",
    ];
    if (
      !this.get(projectId, id) ||
      Object.keys(patch).some((key) => !allowed.includes(key))
    )
      throw Error("INVALID_RUN");
    const entries = Object.entries(patch);
    if (entries.length)
      this.db
        .prepare(
          `UPDATE runs SET ${entries.map(([key]) => `${key}=?`).join(",")},updatedAt=? WHERE projectId=? AND id=?`,
        )
        .run(...entries.map(([, v]) => v ?? null), this.clock(), projectId, id);
  }
  event(runId: string, kind: string, value: string) {
    const count = Number(
      this.db
        .prepare("SELECT count(*) AS n FROM run_events WHERE runId=?")
        .get(runId)!.n,
    );
    if (
      count >= 2000 &&
      ![
        "started",
        "completed",
        "failed",
        "recovery",
        "application",
        "approval",
        "review",
        "review_evidence",
        "revision",
      ].includes(kind)
    )
      return;
    this.db
      .prepare("INSERT INTO run_events(runId,kind,text,at) VALUES(?,?,?,?)")
      .run(runId, kind, redact(value), this.clock());
  }
  /** Latest structured review evidence recorded for a run, if any. */
  reviewEvidence(runId: string): ReviewEvidence | null {
    const row = this.db
      .prepare(
        "SELECT text FROM run_events WHERE runId=? AND kind='review_evidence' ORDER BY seq DESC LIMIT 1",
      )
      .get(runId);
    try {
      return row ? (JSON.parse(String(row.text)) as ReviewEvidence) : null;
    } catch {
      return null;
    }
  }
  events(projectId: string, id: string): RunEvent[] {
    if (!this.get(projectId, id)) throw Error("RUN_NOT_FOUND");
    return this.db
      .prepare(
        "SELECT seq,kind,text,at FROM (SELECT seq,kind,text,at FROM run_events WHERE runId=? ORDER BY seq DESC LIMIT 300) ORDER BY seq",
      )
      .all(id) as unknown as RunEvent[];
  }
  active(): Run[] {
    return this.db
      .prepare(
        "SELECT id,projectId FROM runs WHERE state IN ('preparing','running','reviewing','applying')",
      )
      .all()
      .map((row) => this.get(String(row.projectId), String(row.id))!);
  }
  /** Exact local counters of runs started by Agenting OS; not a provider quota. */
  usage(startOfDay: number): LocalUsage[] {
    return this.db
      .prepare(
        "SELECT provider, COUNT(*) AS runsTotal, SUM(createdAt>=?) AS runsToday, MAX(createdAt) AS lastRunAt FROM runs GROUP BY provider",
      )
      .all(startOfDay)
      .map((row) => ({
        provider: String(row.provider),
        runsTotal: Number(row.runsTotal),
        runsToday: Number(row.runsToday ?? 0),
        lastRunAt: row.lastRunAt == null ? null : Number(row.lastRunAt),
      }));
  }
  /** Latest run of every task, newest first; older attempts are superseded history. */
  latestPerTask(limit = 200) {
    return this.db
      .prepare(
        "SELECT r.id,r.projectId,r.taskId,r.state,r.provider,r.reviewer,r.error,r.updatedAt,t.title FROM runs r JOIN tasks t ON t.projectId=r.projectId AND t.id=r.taskId WHERE r.rowid=(SELECT r2.rowid FROM runs r2 WHERE r2.taskId=r.taskId ORDER BY r2.createdAt DESC,r2.rowid DESC LIMIT 1) ORDER BY r.updatedAt DESC LIMIT ?",
      )
      .all(limit)
      .map((row) => ({
        id: String(row.id),
        projectId: String(row.projectId),
        taskId: String(row.taskId),
        title: String(row.title),
        state: String(row.state) as RunState,
        provider: String(row.provider),
        reviewer: String(row.reviewer),
        error: row.error == null ? null : String(row.error),
        updatedAt: Number(row.updatedAt),
      }));
  }
  /** Real inference evidence: runs whose provider turn actually finished, not configuration. */
  evidence() {
    return this.db
      .prepare(
        "SELECT provider, SUM(state IN ('completed','awaiting_review','applied','rejected')) AS successes, MAX(CASE WHEN state IN ('completed','awaiting_review','applied','rejected') THEN updatedAt END) AS lastSuccessAt, MAX(CASE WHEN state='failed' THEN updatedAt END) AS lastFailureAt FROM runs GROUP BY provider",
      )
      .all()
      .map((row) => ({
        provider: String(row.provider),
        successes: Number(row.successes ?? 0),
        lastSuccessAt:
          row.lastSuccessAt == null ? null : Number(row.lastSuccessAt),
        lastFailureAt:
          row.lastFailureAt == null ? null : Number(row.lastFailureAt),
      }));
  }
  provider(id: string) {
    const row = this.db
      .prepare("SELECT * FROM provider_settings WHERE id=?")
      .get(id);
    return row
      ? {
          id,
          command: String(row.command),
          args: JSON.parse(String(row.args)) as string[],
          protocol: String(row.protocol),
          profile:
            row.profile === "existing"
              ? ("existing" as const)
              : ("isolated" as const),
          consent: row.consent === 1,
          model: row.model == null ? null : String(row.model),
        }
      : null;
  }
  configure(
    id: string,
    command: string,
    args: string[],
    protocol: string,
    profile: "isolated" | "existing" = "isolated",
    model: string | null = null,
  ) {
    this.db
      .prepare(
        "INSERT INTO provider_settings(id,command,args,protocol,consent,profile,model) VALUES(?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET command=excluded.command,args=excluded.args,protocol=excluded.protocol,consent=1,profile=excluded.profile,model=excluded.model",
      )
      .run(id, command, JSON.stringify(args), protocol, profile, model);
  }
}
