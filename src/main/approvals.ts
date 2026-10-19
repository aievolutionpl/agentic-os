import type { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { inputObject } from "./lifecycle.js";

export interface ApprovalRecord {
  id: string;
  projectId: string;
  taskId: string;
  attempt: number;
  diffHash: string;
  artifactId: string | null;
  decision: "approved" | "rejected";
  approver: string;
  createdAt: number;
  expiresAt: number;
}
function label(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 240 || value.includes("\0"))
    throw Error("INVALID_INPUT");
  return value;
}
function attempt(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 3)
    throw Error("INVALID_INPUT");
  return value;
}
// Hash exact bytes, without text decoding, trimming or newline normalization.
function hash(value: unknown): string {
  if (!Buffer.isBuffer(value) || value.length === 0 || value.length > 10 * 1024 * 1024)
    throw Error("INVALID_DIFF");
  return createHash("sha256").update(value).digest("hex");
}
// Internal metadata only: this API neither authenticates a user nor authorizes execution.
export class Approvals {
  constructor(private db: DatabaseSync, private clock: () => number) {}
  migrate() {
    this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE approval_records(
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL, taskId TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK(attempt BETWEEN 0 AND 3),
        diffHash TEXT NOT NULL CHECK(length(diffHash)=64 AND diffHash NOT GLOB '*[^0-9a-f]*'),
        decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
        approver TEXT NOT NULL CHECK(length(trim(approver)) BETWEEN 1 AND 240),
        createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL CHECK(expiresAt>createdAt),
        FOREIGN KEY(projectId,taskId) REFERENCES tasks(projectId,id));
      CREATE INDEX approval_scope ON approval_records(projectId,taskId);
      CREATE TRIGGER approval_no_update BEFORE UPDATE ON approval_records BEGIN SELECT RAISE(ABORT,'IMMUTABLE_APPROVAL'); END;
      CREATE TRIGGER approval_no_delete BEFORE DELETE ON approval_records BEGIN SELECT RAISE(ABORT,'IMMUTABLE_APPROVAL'); END;
      PRAGMA user_version=3;
      COMMIT;`);
  }
  migrateArtifactBinding() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`
        ALTER TABLE approval_records ADD COLUMN artifactId TEXT REFERENCES diff_artifacts(id);
        CREATE TRIGGER approval_artifact_scope BEFORE INSERT ON approval_records
        WHEN NEW.artifactId IS NULL OR NOT EXISTS (
          SELECT 1 FROM diff_artifacts d JOIN tasks t ON t.projectId=d.projectId AND t.id=d.taskId
          WHERE d.id=NEW.artifactId AND d.projectId=NEW.projectId AND d.taskId=NEW.taskId
          AND d.attempt=NEW.attempt AND t.attempt=NEW.attempt AND d.diffHash=NEW.diffHash)
        BEGIN SELECT RAISE(ABORT,'ARTIFACT_SCOPE_MISMATCH'); END;
        PRAGMA user_version=5; COMMIT;`);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  decide(input: unknown): ApprovalRecord {
    const p = inputObject(input);
    const allowed = ["projectId","taskId","attempt","artifactId","decision","approver","expiresAt"];
    if (Object.keys(p).some(k => !allowed.includes(k))) throw Error("INVALID_INPUT");
    const projectId = label(p.projectId), taskId = label(p.taskId), n = attempt(p.attempt);
    const artifactId = label(p.artifactId), approver = label(p.approver), now = this.clock();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const artifact = this.db.prepare(`SELECT d.diff FROM diff_artifacts d JOIN tasks t
        ON t.projectId=d.projectId AND t.id=d.taskId
        WHERE d.id=? AND d.projectId=? AND d.taskId=? AND d.attempt=? AND t.attempt=d.attempt`)
        .get(artifactId,projectId,taskId,n);
      if (!artifact) throw Error('ARTIFACT_SCOPE_MISMATCH');
      const diffHash = hash(Buffer.from(artifact.diff as Uint8Array));
      if ((p.decision !== "approved" && p.decision !== "rejected") ||
          typeof p.expiresAt !== "number" || !Number.isSafeInteger(p.expiresAt) || p.expiresAt <= now)
        throw Error("INVALID_INPUT");
      const record: ApprovalRecord = {id:randomUUID(),projectId,taskId,attempt:n,diffHash,artifactId,
        decision:p.decision,approver,createdAt:now,expiresAt:p.expiresAt};
      this.db.prepare(`INSERT INTO approval_records
        (id,projectId,taskId,attempt,diffHash,decision,approver,createdAt,expiresAt,artifactId)
        VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .run(record.id,projectId,taskId,n,diffHash,record.decision,approver,now,record.expiresAt,artifactId);
      this.db.exec('COMMIT');
      return record;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  list(projectId: unknown, taskId: unknown): ApprovalRecord[] {
    return this.db.prepare("SELECT * FROM approval_records WHERE projectId=? AND taskId=? ORDER BY rowid")
      .all(label(projectId),label(taskId)).map(row => ({...row})) as unknown as ApprovalRecord[];
  }
  matches(input: unknown): boolean {
    const p = inputObject(input);
    return !!this.db.prepare(`SELECT 1 FROM approval_records a JOIN tasks t ON t.projectId=a.projectId AND t.id=a.taskId
      WHERE a.id=? AND a.projectId=? AND a.taskId=? AND a.attempt=? AND t.attempt=a.attempt
      AND a.artifactId=? AND a.diffHash=? AND a.decision='approved' AND a.expiresAt>?`)
      .get(label(p.id),label(p.projectId),label(p.taskId),attempt(p.attempt),label(p.artifactId),hash(p.diff),this.clock());
  }
}
