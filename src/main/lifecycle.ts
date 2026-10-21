import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { Task, TaskEvent, FailureCode } from "../shared.js";
export function inputObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("INVALID_INPUT");
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 240 ||
    value.includes("\0")
  )
    throw Error("INVALID_INPUT");
  return value;
}
export class Lifecycle {
  constructor(
    private db: DatabaseSync,
    private clock: () => number = Date.now,
  ) {}
  transaction<T>(fn: () => T): T {
    if (this.db.isTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  migrate() {
    this.transaction(() => {
      const version = Number(
        this.db.prepare("PRAGMA user_version").get()!.user_version,
      );
      // Store refuses schemas newer than this build before migrations run.
      if (version >= 2) return;
      if (version !== 1) throw Error("UNSUPPORTED_SCHEMA");
      this.db.exec(`ALTER TABLE tasks RENAME TO tasks_v1;
        CREATE TABLE tasks(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),title TEXT NOT NULL,implementer TEXT NOT NULL,reviewer TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','queued','running','completed','failed','cancelled')),createdAt TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 3),owner TEXT,token TEXT,expiresAt INTEGER,heartbeatAt INTEGER,failure TEXT CHECK(failure IN ('worker_error','validation_failed','lease_expired')),
        UNIQUE(projectId,id),CHECK((status='running' AND owner IS NOT NULL AND token IS NOT NULL AND expiresAt IS NOT NULL AND heartbeatAt IS NOT NULL) OR (status!='running' AND owner IS NULL AND token IS NULL AND expiresAt IS NULL AND heartbeatAt IS NULL)));
        INSERT INTO tasks(id,projectId,title,implementer,reviewer,status,createdAt) SELECT * FROM tasks_v1;
        DROP TABLE tasks_v1;
        CREATE INDEX task_scope ON tasks(projectId);
        CREATE TABLE task_dependencies(projectId TEXT NOT NULL,taskId TEXT NOT NULL,dependencyId TEXT NOT NULL,PRIMARY KEY(taskId,dependencyId),CHECK(taskId!=dependencyId),FOREIGN KEY(projectId,taskId) REFERENCES tasks(projectId,id),FOREIGN KEY(projectId,dependencyId) REFERENCES tasks(projectId,id));
        CREATE TABLE task_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,projectId TEXT NOT NULL,taskId TEXT NOT NULL,kind TEXT NOT NULL,attempt INTEGER NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,failure TEXT,details TEXT,FOREIGN KEY(projectId,taskId) REFERENCES tasks(projectId,id));
        CREATE INDEX event_scope ON task_events(projectId,seq);
        INSERT INTO task_events(projectId,taskId,kind,attempt,actor,at) SELECT projectId,id,'imported',0,'migration',createdAt FROM tasks;
        PRAGMA user_version=2;`);
    });
  }
  private row(
    projectId: unknown,
    taskId: unknown,
  ): Task & { token: string | null } {
    const row = this.db
      .prepare("SELECT * FROM tasks WHERE projectId=? AND id=?")
      .get(id(projectId), id(taskId));
    if (!row) throw Error("TASK_NOT_FOUND");
    return row as unknown as Task & { token: string | null };
  }
  private project(projectId: unknown): string {
    const key = id(projectId);
    if (!this.db.prepare("SELECT id FROM projects WHERE id=?").get(key))
      throw Error("PROJECT_NOT_FOUND");
    return key;
  }
  event(
    task: Pick<Task, "id" | "projectId" | "attempt">,
    kind: TaskEvent["kind"],
    actor = "user",
    failure: FailureCode | null = null,
    details: string | null = null,
  ) {
    this.db
      .prepare(
        "INSERT INTO task_events(projectId,taskId,kind,attempt,actor,at,failure,details) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        task.projectId,
        task.id,
        kind,
        task.attempt,
        actor,
        new Date(this.clock()).toISOString(),
        failure,
        details,
      );
  }
  tasks(projectId: unknown): Task[] {
    return this.db
      .prepare(
        "SELECT id,projectId,title,implementer,reviewer,status,createdAt,attempt,owner,expiresAt,heartbeatAt,failure FROM tasks WHERE projectId=? ORDER BY createdAt,id",
      )
      .all(this.project(projectId))
      .map((row) => {
        const dependencies = this.db
          .prepare(
            "SELECT dependencyId FROM task_dependencies WHERE taskId=? ORDER BY dependencyId",
          )
          .all(row.id!)
          .map((d) => String(d.dependencyId));
        const blockedBy = dependencies.filter(
          (d) => this.row(projectId, d).status !== "completed",
        );
        return {
          ...row,
          dependencies,
          blockedBy,
          ready: row.status === "queued" && blockedBy.length === 0,
          awaitingApproval:
            row.status === "completed" && this.unapproved(String(row.id)),
        } as unknown as Task;
      });
  }
  /** A dependent may start only once the latest run is completed or applied
   * (see the supervisor's dependency check); a task without runs is ready. */
  private unapproved(taskId: string) {
    try {
      const run = this.db
        .prepare(
          "SELECT state FROM runs WHERE taskId=? ORDER BY createdAt DESC,rowid DESC LIMIT 1",
        )
        .get(taskId);
      return !!run && !["applied", "completed"].includes(String(run.state));
    } catch {
      return false;
    }
  }
  events(projectId: unknown): TaskEvent[] {
    return this.db
      .prepare("SELECT * FROM task_events WHERE projectId=? ORDER BY seq")
      .all(this.project(projectId)) as unknown as TaskEvent[];
  }
  action(input: unknown) {
    const p = inputObject(input);
    return this.transaction(() => {
      const t = this.row(p.projectId, p.id);
      if (p.action === "dependencies") {
        if (
          t.status !== "draft" ||
          !Array.isArray(p.dependencyIds) ||
          p.dependencyIds.length > 100
        )
          throw Error("INVALID_TRANSITION");
        const deps = p.dependencyIds.map((d) => this.row(t.projectId, d).id);
        if (new Set(deps).size !== deps.length) throw Error("INVALID_INPUT");
        this.db
          .prepare("DELETE FROM task_dependencies WHERE taskId=?")
          .run(t.id);
        for (const dep of deps) {
          if (
            dep === t.id ||
            this.db
              .prepare(
                `WITH RECURSIVE ancestors(id) AS (SELECT dependencyId FROM task_dependencies WHERE taskId=? UNION SELECT d.dependencyId FROM task_dependencies d JOIN ancestors a ON d.taskId=a.id) SELECT 1 FROM ancestors WHERE id=?`,
              )
              .get(dep, t.id)
          )
            throw Error("DEPENDENCY_CYCLE");
          this.db
            .prepare("INSERT INTO task_dependencies VALUES(?,?,?)")
            .run(t.projectId, t.id, dep);
        }
        this.event(t, "dependencies", "user", null, JSON.stringify(deps));
      } else {
        const action = p.action;
        const valid =
          (action === "queue" && t.status === "draft") ||
          (action === "retry" && t.status === "failed" && t.attempt < 3) ||
          (action === "cancel" &&
            ["draft", "queued", "failed"].includes(t.status));
        if (!valid) throw Error("INVALID_TRANSITION");
        this.db
          .prepare("UPDATE tasks SET status=?,failure=NULL WHERE id=?")
          .run(action === "cancel" ? "cancelled" : "queued", t.id);
        this.event(
          t,
          action === "queue"
            ? "queued"
            : action === "retry"
              ? "retried"
              : "cancelled",
        );
      }
    });
  }
  /** Internal only (no renderer IPC): a reviewed result goes back to the
   * queue for a revision, within the task's attempt limit. */
  reopen(projectId: unknown, id: unknown, maxAttempts: number) {
    return this.transaction(() => {
      const t = this.row(projectId, id);
      if (t.status !== "completed") throw Error("INVALID_TRANSITION");
      if (t.attempt >= maxAttempts) throw Error("REVISION_LIMIT_REACHED");
      this.db
        .prepare("UPDATE tasks SET status='queued',failure=NULL WHERE id=?")
        .run(t.id);
      this.event(t, "revision");
    });
  }
  private ttl(value: unknown): number {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 1000 ||
      value > 300000
    )
      throw Error("INVALID_TTL");
    return value;
  }
  // Internal metadata API only. No renderer IPC and no subprocess/provider invocation.
  claim(input: unknown) {
    const p = inputObject(input),
      owner = id(p.owner),
      ttl = this.ttl(p.ttlMs);
    return this.transaction(() => {
      const t = this.row(p.projectId, p.id);
      if (
        t.status !== "queued" ||
        t.attempt >= 3 ||
        !this.tasks(t.projectId).find((x) => x.id === t.id)!.ready
      )
        throw Error("NOT_READY");
      const token = randomUUID(),
        now = this.clock(),
        expiresAt = now + ttl;
      this.db
        .prepare(
          "UPDATE tasks SET status='running',attempt=attempt+1,owner=?,token=?,expiresAt=?,heartbeatAt=?,failure=NULL WHERE id=?",
        )
        .run(owner, token, expiresAt, now, t.id);
      this.event(
        { ...t, attempt: t.attempt + 1 },
        "claimed",
        owner,
        null,
        JSON.stringify({ expiresAt }),
      );
      return { token, owner, expiresAt, attempt: t.attempt + 1 };
    });
  }
  private owned(p: Record<string, unknown>) {
    const t = this.row(p.projectId, p.id);
    if (
      t.status !== "running" ||
      t.owner !== id(p.owner) ||
      t.token !== id(p.token) ||
      t.expiresAt! <= this.clock()
    )
      throw Error("LEASE_LOST");
    return t;
  }
  heartbeat(input: unknown) {
    const p = inputObject(input),
      ttl = this.ttl(p.ttlMs);
    return this.transaction(() => {
      const t = this.owned(p),
        now = this.clock(),
        expiresAt = Math.max(t.expiresAt!, now + ttl);
      this.db
        .prepare("UPDATE tasks SET expiresAt=?,heartbeatAt=? WHERE id=?")
        .run(expiresAt, now, t.id);
      this.event(t, "heartbeat", t.owner!, null, JSON.stringify({ expiresAt }));
      return expiresAt;
    });
  }
  private end(
    t: Task,
    status: "failed" | "completed" | "cancelled",
    failure: FailureCode | null,
    actor: string,
  ) {
    this.db
      .prepare(
        "UPDATE tasks SET status=?,failure=?,owner=NULL,token=NULL,expiresAt=NULL,heartbeatAt=NULL WHERE id=?",
      )
      .run(status, failure, t.id);
    this.event(t, status, actor, failure);
  }
  finish(input: unknown) {
    const p = inputObject(input);
    return this.transaction(() => {
      const t = this.owned(p);
      if (p.outcome !== "completed" && p.outcome !== "failed")
        throw Error("INVALID_INPUT");
      if (
        p.outcome === "failed" &&
        p.failure !== "worker_error" &&
        p.failure !== "validation_failed"
      )
        throw Error("INVALID_INPUT");
      this.end(
        t,
        p.outcome,
        p.outcome === "failed" ? (p.failure as FailureCode) : null,
        t.owner!,
      );
    });
  }
  cancelOwned(input: unknown) {
    const p = inputObject(input);
    return this.transaction(() => {
      const task = this.owned(p);
      this.end(task, "cancelled", null, task.owner!);
    });
  }
  interrupt(projectId: string, taskId: string) {
    return this.transaction(() => {
      const task = this.row(projectId, taskId);
      if (task.status === "running")
        this.end(task, "failed", "worker_error", "recovery");
    });
  }
  recover(projectId: unknown): number {
    return this.transaction(() => {
      const tasks = this.db
        .prepare(
          "SELECT * FROM tasks WHERE projectId=? AND status='running' AND expiresAt<=?",
        )
        .all(this.project(projectId), this.clock()) as unknown as Task[];
      for (const t of tasks) this.end(t, "failed", "lease_expired", "system");
      return tasks.length;
    });
  }
}
