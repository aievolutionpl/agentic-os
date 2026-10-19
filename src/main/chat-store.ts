import type { DatabaseSync } from "node:sqlite";
import type { ChatSession } from "../shared.js";

export class ChatStore {
  constructor(private db: DatabaseSync) {
    if (Number(db.prepare("PRAGMA user_version").get()!.user_version) === 10) {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), updatedAt INTEGER NOT NULL, state TEXT NOT NULL);`);
      try {
        const columns = db
          .prepare("PRAGMA table_info(memory)")
          .all()
          .map((row) => row.name);
        if (!columns.includes("pinned"))
          db.exec(
            "ALTER TABLE memory ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
          );
        if (!columns.includes("updatedAt"))
          db.exec("ALTER TABLE memory ADD COLUMN updatedAt TEXT");
        db.exec("PRAGMA user_version=11; COMMIT;");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
    for (const item of this.list()) {
      if (item.status !== "running") continue;
      item.status = "interrupted";
      item.error = "CHAT_INTERRUPTED";
      item.messages.forEach((m) => {
        if (m.status === "streaming") m.status = "cancelled";
      });
      this.save(item);
    }
  }
  list(): ChatSession[] {
    return this.db
      .prepare("SELECT state FROM chats ORDER BY updatedAt DESC LIMIT 100")
      .all()
      .map((row) => JSON.parse(String(row.state)));
  }
  get(id: string): ChatSession {
    const row = this.db.prepare("SELECT state FROM chats WHERE id=?").get(id);
    if (!row) throw Error("CHAT_NOT_FOUND");
    return JSON.parse(String(row.state));
  }
  save(chat: ChatSession) {
    chat.updatedAt = Date.now();
    this.db
      .prepare(
        "INSERT INTO chats VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET updatedAt=excluded.updatedAt,state=excluded.state",
      )
      .run(chat.id, chat.projectId, chat.updatedAt, JSON.stringify(chat));
  }
  remove(id: string) {
    this.db.prepare("DELETE FROM chats WHERE id=?").run(id);
  }
}
