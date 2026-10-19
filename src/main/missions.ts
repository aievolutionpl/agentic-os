import type { DatabaseSync } from "node:sqlite";
import type { Mission } from "../shared.js";
import type { Knowledge } from "./knowledge.js";

export type MissionContext = ReturnType<Knowledge["build"]>;

/** Durable mission journal. Provider output never becomes SQL or an IPC command. */
export class Missions {
  constructor(private db: DatabaseSync) {
    if (Number(db.prepare("PRAGMA user_version").get()!.user_version) === 9) {
      db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
      try {
        db.exec(`CREATE TABLE projects_master(id TEXT PRIMARY KEY,name TEXT NOT NULL,root TEXT NOT NULL,master TEXT NOT NULL CHECK(master IN ('codex','claude','gemini','hermes','opencode','local','antigravity')),createdAt TEXT NOT NULL);
          INSERT INTO projects_master SELECT * FROM projects;
          DROP TABLE projects;
          ALTER TABLE projects_master RENAME TO projects;
          CREATE TABLE IF NOT EXISTS missions(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),createdAt INTEGER NOT NULL,state TEXT NOT NULL,context TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS missions_project ON missions(projectId,createdAt);
          PRAGMA user_version=10;`);
        if (db.prepare("PRAGMA foreign_key_check").all().length)
          throw Error("MIGRATION_FOREIGN_KEY_FAILURE");
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      } finally {
        db.exec("PRAGMA foreign_keys=ON");
      }
    }
  }
  list(projectId: string): Mission[] {
    return this.db
      .prepare(
        "SELECT state FROM missions WHERE projectId=? ORDER BY createdAt DESC,rowid DESC LIMIT 20",
      )
      .all(projectId)
      .map((row) => JSON.parse(String(row.state)));
  }
  get(projectId: string, id: string): Mission {
    const row = this.db
      .prepare("SELECT state FROM missions WHERE projectId=? AND id=?")
      .get(projectId, id);
    if (!row) throw Error("MISSION_NOT_FOUND");
    return JSON.parse(String(row.state));
  }
  context(projectId: string, id: string): MissionContext {
    const row = this.db
      .prepare("SELECT context FROM missions WHERE projectId=? AND id=?")
      .get(projectId, id);
    if (!row) throw Error("MISSION_NOT_FOUND");
    return JSON.parse(String(row.context));
  }
  create(mission: Mission, context: MissionContext) {
    this.db
      .prepare("INSERT INTO missions VALUES(?,?,?,?,?)")
      .run(
        mission.id,
        mission.projectId,
        mission.createdAt,
        JSON.stringify(mission),
        JSON.stringify(context),
      );
  }
  save(mission: Mission) {
    mission.updatedAt = Date.now();
    const result = this.db
      .prepare("UPDATE missions SET state=? WHERE id=? AND projectId=?")
      .run(JSON.stringify(mission), mission.id, mission.projectId);
    if (!result.changes) throw Error("MISSION_NOT_FOUND");
  }
  recover() {
    const rows = this.db.prepare("SELECT state FROM missions").all();
    for (const row of rows) {
      const mission: Mission = JSON.parse(String(row.state));
      if (["planning", "running", "evaluating"].includes(mission.status)) {
        mission.status = "interrupted";
        mission.reason = "APP_INTERRUPTED";
        this.save(mission);
      }
    }
  }
}
