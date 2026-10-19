import type { DatabaseSync } from "node:sqlite";

/** Preserve v1-v8 data while expanding provider choices and explicit memory sharing. */
export function migrateWorkspace(db: DatabaseSync) {
  if (Number(db.prepare("PRAGMA user_version").get()!.user_version) !== 8)
    return;
  db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;");
  try {
    db.exec(`CREATE TABLE projects_next(id TEXT PRIMARY KEY,name TEXT NOT NULL,root TEXT NOT NULL,master TEXT NOT NULL CHECK(master IN ('codex','claude','opencode','antigravity')),createdAt TEXT NOT NULL);
      INSERT INTO projects_next SELECT id,name,root,master,createdAt FROM projects;
      DROP TABLE projects;
      ALTER TABLE projects_next RENAME TO projects;`);
    // Idempotent column checks also allow legacy migration test fixtures.
    const columns = (table: string) =>
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((r) => r.name);
    if (!columns("memory").includes("scope"))
      db.exec(
        "ALTER TABLE memory ADD COLUMN scope TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('project','workspace'))",
      );
    if (!columns("provider_settings").includes("profile"))
      db.exec(
        "ALTER TABLE provider_settings ADD COLUMN profile TEXT NOT NULL DEFAULT 'isolated'",
      );
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw Error("MIGRATION_FOREIGN_KEY_FAILURE");
    db.exec("PRAGMA user_version=9; COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys=ON");
  }
}
