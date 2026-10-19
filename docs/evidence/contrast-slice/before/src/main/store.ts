import { Lifecycle } from "./lifecycle.js";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  Agent,
  Project,
  Task,
  Memory,
  Preferences,
  Integration,
} from "../shared.js";
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("INVALID_INPUT");
  return input as Record<string, unknown>;
}
function text(input: unknown, max = 240, empty = false): string {
  if (
    typeof input !== "string" ||
    input.length > max ||
    (!empty && !input.trim()) ||
    input.includes("\0")
  )
    throw Error("INVALID_INPUT");
  return input.trim();
}
function agent(input: unknown): Agent {
  if (input !== "codex" && input !== "claude") throw Error("INVALID_INPUT");
  return input;
}
export class Store {
  private db: DatabaseSync;
  readonly lifecycle: Lifecycle;
  constructor(file: string, clock: () => number = Date.now) {
    this.db = new DatabaseSync(file);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const version = this.db.prepare("PRAGMA user_version").get() as {
        user_version: number;
      };
      if (version.user_version > 2) {
        throw Error("UNSUPPORTED_SCHEMA");
      }
      if (version.user_version < 1)
        this.db.exec(`
   CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,root TEXT NOT NULL,master TEXT NOT NULL CHECK(master IN ('codex','claude')),createdAt TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),title TEXT NOT NULL,implementer TEXT NOT NULL,reviewer TEXT NOT NULL,status TEXT NOT NULL CHECK(status='draft'),createdAt TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS memory(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),content TEXT NOT NULL,source TEXT NOT NULL,createdAt TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS memory_scope ON memory(projectId);
   CREATE INDEX IF NOT EXISTS task_scope ON tasks(projectId);
   CREATE TABLE IF NOT EXISTS preferences(id INTEGER PRIMARY KEY CHECK(id=1),language TEXT NOT NULL,theme TEXT NOT NULL);
   INSERT OR IGNORE INTO preferences VALUES(1,'pl','dark');
   PRAGMA user_version=1;`);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.db.close();
      throw error;
    }
    this.lifecycle = new Lifecycle(this.db, clock);
    try {
      this.lifecycle.migrate();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  private project(id: unknown): string {
    const value = text(id);
    if (!this.db.prepare("SELECT id FROM projects WHERE id=?").get(value))
      throw Error("PROJECT_NOT_FOUND");
    return value;
  }
  projects(): Project[] {
    return this.db
      .prepare("SELECT * FROM projects ORDER BY createdAt,id")
      .all() as unknown as Project[];
  }
  createProject(input: unknown): Project {
    const p = object(input);
    const result: Project = {
      id: randomUUID(),
      name: text(p.name),
      root: text(p.root, 4096, true),
      master: agent(p.master),
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare("INSERT INTO projects VALUES(?,?,?,?,?)")
      .run(
        result.id,
        result.name,
        result.root,
        result.master,
        result.createdAt,
      );
    return result;
  }
  tasks(id: unknown): Task[] {
    return this.lifecycle.tasks(id);
  }
  projectData(id: unknown) {
    this.lifecycle.recover(id);
    return this.lifecycle.transaction(() => ({
      tasks: this.tasks(id),
      memory: this.memory(id),
      events: this.events(id),
    }));
  }
  events(id: unknown) {
    return this.lifecycle.events(id);
  }
  taskAction(input: unknown) {
    return this.lifecycle.action(input);
  }
  createTask(input: unknown): Task {
    const p = object(input);
    const result: Task = {
      id: randomUUID(),
      projectId: this.project(p.projectId),
      title: text(p.title, 4000),
      implementer: agent(p.implementer),
      reviewer: agent(p.reviewer),
      status: "draft",
      attempt: 0,
      owner: null,
      expiresAt: null,
      heartbeatAt: null,
      failure: null,
      dependencies: [],
      blockedBy: [],
      ready: false,
      createdAt: new Date().toISOString(),
    };
    if (result.implementer === result.reviewer)
      throw Error("INDEPENDENT_REVIEW_REQUIRED");
    this.lifecycle.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO tasks(id,projectId,title,implementer,reviewer,status,createdAt) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          result.id,
          result.projectId,
          result.title,
          result.implementer,
          result.reviewer,
          result.status,
          result.createdAt,
        );
      this.lifecycle.event(result, "created");
    });
    return result;
  }
  memory(id: unknown): Memory[] {
    return this.db
      .prepare("SELECT * FROM memory WHERE projectId=? ORDER BY createdAt,id")
      .all(this.project(id)) as unknown as Memory[];
  }
  createMemory(input: unknown): Memory {
    const p = object(input);
    const result: Memory = {
      id: randomUUID(),
      projectId: this.project(p.projectId),
      content: text(p.content, 20000),
      source: text(p.source, 1000),
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare("INSERT INTO memory VALUES(?,?,?,?,?)")
      .run(
        result.id,
        result.projectId,
        result.content,
        result.source,
        result.createdAt,
      );
    return result;
  }
  deleteMemory(input: unknown) {
    const p = object(input);
    const result = this.db
      .prepare("DELETE FROM memory WHERE projectId=? AND id=?")
      .run(this.project(p.projectId), text(p.id));
    if (!result.changes) throw Error("MEMORY_NOT_FOUND");
  }
  preferences(): Preferences {
    return {
      ...this.db
        .prepare("SELECT language,theme FROM preferences WHERE id=1")
        .get(),
    } as unknown as Preferences;
  }
  setPreferences(input: unknown): Preferences {
    const p = object(input);
    if (
      typeof p.language !== "string" ||
      typeof p.theme !== "string" ||
      !["pl", "en"].includes(p.language) ||
      !["light", "dark"].includes(p.theme)
    )
      throw Error("INVALID_INPUT");
    this.db
      .prepare("UPDATE preferences SET language=?,theme=? WHERE id=1")
      .run(p.language as string, p.theme as string);
    return this.preferences();
  }
  setMaster(input: unknown) {
    const p = object(input);
    this.db
      .prepare("UPDATE projects SET master=? WHERE id=?")
      .run(agent(p.master), this.project(p.projectId));
  }
  integrations(): Integration[] {
    return [
      { id: "codex", name: "Codex" },
      { id: "claude", name: "Claude Code" },
      { id: "openrouter", name: "OpenRouter API" },
      { id: "custom", name: "OpenAI-compatible API" },
      { id: "ollama", name: "Ollama / LM Studio" },
      { id: "gemini", name: "Gemini CLI" },
      { id: "hermes", name: "Hermes" },
      { id: "opencode", name: "OpenCode" },
      { id: "antigravity", name: "Antigravity" },
    ].map((p) => ({
      ...p,
      status: "not_configured",
      quota: {
        state: "unknown",
        remaining: null,
        unit: null,
        source: null,
        observedAt: null,
        resetAt: null,
      },
    }));
  }
}
