import type { DatabaseSync } from "node:sqlite";
import type { Memory } from "../shared.js";
import { text } from "./validate.js";
export const WORKFLOWS = {
  implementation: {
    readOnly: false,
    instructions:
      "Implement the smallest maintainable solution. Reuse the project conventions. Run relevant existing checks and report actual results and limitations.",
  },
  bugfix: {
    readOnly: false,
    instructions:
      "Find the root cause before changing code. Add a meaningful regression check when warranted, implement the fix and run affected checks. Report the reproduced problem and actual validation.",
  },
  research: {
    readOnly: true,
    instructions:
      "Research the available local project evidence without changing files. Distinguish facts, sources, assumptions and unanswered questions. Report a concise recommendation; no fabricated citations.",
  },
  audit: {
    readOnly: true,
    instructions:
      "Audit the existing UI source and available local evidence without changing files. Report specific actionable findings with file locations, accessibility issues and validation gaps.",
  },
} as const;
export interface ContextSkill {
  id: string;
  name: string;
  version: string;
  source: string;
  license: string;
  instructions: string;
}
export class Knowledge {
  constructor(private db: DatabaseSync) {
    if (Number(db.prepare("PRAGMA user_version").get()!.user_version) === 6)
      db.exec(`BEGIN IMMEDIATE;
      CREATE VIRTUAL TABLE memory_search USING fts5(id UNINDEXED,projectId UNINDEXED,content,source);
      INSERT INTO memory_search SELECT id,projectId,content,source FROM memory;
      CREATE TRIGGER memory_search_insert AFTER INSERT ON memory BEGIN INSERT INTO memory_search VALUES(new.id,new.projectId,new.content,new.source);END;
      CREATE TRIGGER memory_search_delete AFTER DELETE ON memory BEGIN DELETE FROM memory_search WHERE id=old.id;END;
      CREATE TRIGGER memory_search_update AFTER UPDATE ON memory BEGIN DELETE FROM memory_search WHERE id=old.id;INSERT INTO memory_search VALUES(new.id,new.projectId,new.content,new.source);END;
      PRAGMA user_version=7;COMMIT;`);
  }
  private project(projectId: string) {
    if (
      !this.db
        .prepare("SELECT id FROM projects WHERE id=?")
        .get(text(projectId))
    )
      throw Error("PROJECT_NOT_FOUND");
  }
  search(projectId: string, query: string): Memory[] {
    this.project(projectId);
    text(query, 1000, true);
    const tokens = query.match(/[\p{L}\p{N}_]{2,}/gu)?.slice(0, 8) ?? [];
    if (!tokens.length) {
      const rows = this.db
        .prepare(
          "SELECT * FROM memory WHERE projectId=? ORDER BY createdAt DESC,id",
        )
        .all(projectId) as unknown as Memory[];
      return rows
        .filter(
          (row) =>
            !query.trim() ||
            (row.content + " " + row.source)
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase()),
        )
        .slice(0, 50);
    }
    const match = tokens.map((token) => `"${token}"*`).join(" OR ");
    return this.db
      .prepare(
        "SELECT m.* FROM memory_search JOIN memory m ON m.id=memory_search.id WHERE memory_search MATCH ? AND m.projectId=? ORDER BY bm25(memory_search),m.id LIMIT 50",
      )
      .all(match, projectId) as unknown as Memory[];
  }
  build(
    projectId: string,
    ids: unknown,
    workflow: unknown = "implementation",
    skills: ContextSkill[] = [],
  ) {
    this.project(projectId);
    if (
      !Array.isArray(ids) ||
      ids.length > 20 ||
      ids.some((id) => typeof id !== "string") ||
      new Set(ids).size !== ids.length
    )
      throw Error("INVALID_CONTEXT");
    const key = text(workflow, 40) as keyof typeof WORKFLOWS;
    if (!Object.hasOwn(WORKFLOWS, key)) throw Error("INVALID_WORKFLOW");
    const memory = ids.map((id) => {
      const row = this.db
        .prepare("SELECT * FROM memory WHERE projectId=? AND id=?")
        .get(projectId, text(id));
      if (!row) throw Error("INVALID_CONTEXT");
      return row as unknown as Memory;
    });
    const body = [
      `Workflow: ${key}\n${WORKFLOWS[key].instructions}`,
      ...memory.map(
        (entry) =>
          `[Memory ${entry.id}; source: ${entry.source}; date: ${entry.createdAt}]\n${entry.content}`,
      ),
      ...skills.map(
        (skill) =>
          `[Skill ${skill.id}@${skill.version}; source: ${skill.source}; license: ${skill.license}]\n${skill.instructions}`,
      ),
    ].join("\n\n");
    if (body.length > 24000) throw Error("CONTEXT_BUDGET_EXCEEDED");
    return {
      body,
      characters: body.length,
      limit: 24000,
      readOnly: WORKFLOWS[key].readOnly,
      memoryIds: memory.map((entry) => entry.id),
      workflow: key,
    };
  }
}
