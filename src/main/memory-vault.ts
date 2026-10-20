import { KnowledgeGraphManager } from "@modelcontextprotocol/server-memory/dist/index.js";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  lstatSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Store } from "./store.js";
import type { ChatSession, Memory, MemoryGraph } from "../shared.js";
import { redact } from "./validate.js";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
/** SQLite owns notes; the upstream MCP engine persists their graph. Markdown is editable. */
export class MemoryVault {
  readonly directory: string;
  private engine: KnowledgeGraphManager;
  private pending?: Promise<MemoryGraph>;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private enabled = true;
  private hashes: Record<string, string> = {};
  private bodies: Record<string, string> = {};
  private seen: Record<string, number> = {};
  constructor(
    private store: Store,
    dataDir: string,
  ) {
    this.directory = join(dataDir, "memory-vault");
    mkdirSync(this.directory, { recursive: true });
    if (lstatSync(this.directory).isSymbolicLink())
      throw Error("MEMORY_PATH_UNSAFE");
    this.checkPaths();
    this.engine = new KnowledgeGraphManager(
      join(this.directory, "knowledge-graph.jsonl"),
    );
    try {
      const state = JSON.parse(
        readFileSync(join(this.directory, "sync-state.json"), "utf8"),
      );
      this.hashes = state.hashes ?? {};
      this.bodies = state.bodies ?? {};
      this.seen = state.seen ?? {};
      this.enabled = state.enabled !== false;
    } catch {
      /* First start: build from durable notes. */
    }
  }
  private checkPaths() {
    if (lstatSync(this.directory).isSymbolicLink())
      throw Error("MEMORY_PATH_UNSAFE");
    for (const file of [
      "knowledge-graph.jsonl",
      "knowledge-graph.jsonl.lock",
      "knowledge-graph.jsonl.lock.break",
      "sync-state.json",
    ]) {
      const path = join(this.directory, file);
      try {
        const info = lstatSync(path);
        if (info.isSymbolicLink() || !info.isFile())
          throw Error("MEMORY_PATH_UNSAFE");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  private saveState() {
    this.checkPaths();
    const path = join(this.directory, "sync-state.json");
    const state = JSON.stringify({
      hashes: this.hashes,
      bodies: this.bodies,
      seen: this.seen,
      enabled: this.enabled,
    });
    if (!existsSync(path) || readFileSync(path, "utf8") !== state)
      writeFileSync(path, state);
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.saveState();
    return this.sync();
  }
  capture(chat: ChatSession) {
    if (!this.enabled || chat.status !== "idle") return;
    const reply = chat.messages.at(-1);
    if (
      !reply ||
      reply.role !== "assistant" ||
      reply.status !== "complete" ||
      this.seen[chat.id] === reply.at
    )
      return;
    const question = chat.messages.at(-2);
    this.upsert(
      chat.projectId,
      `auto:chat:${chat.id}`,
      `${chat.title}\n\nConversation record / zapis rozmowy — claims are attributed to the speaker.\n\nUser: ${redact(question?.content ?? "", 700)}\n\n${chat.agent}: ${redact(reply.content, 2200)}`,
    );
    this.seen[chat.id] = reply.at;
  }
  private upsert(projectId: string, source: string, content: string) {
    const old = this.store
      .memory(projectId)
      .find((m) => m.projectId === projectId && m.source === source);
    if (old?.content === content) return;
    if (old)
      this.store.updateMemory({
        projectId,
        id: old.id,
        content,
        scope: old.scope ?? "project",
        pinned: !!old.pinned,
      });
    else
      this.store.createMemory({ projectId, content, source, scope: "project" });
  }
  private notePath(id: string) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw Error("MEMORY_ID_INVALID");
    const path = join(this.directory, `${id}.md`);
    try {
      const info = lstatSync(path);
      if (info.isSymbolicLink() || !info.isFile())
        throw Error("MEMORY_PATH_UNSAFE");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return path;
  }
  private importEdits(rows: Memory[]) {
    for (const row of rows) {
      const path = this.notePath(row.id);
      if (
        !this.hashes[row.id] ||
        !existsSync(path) ||
        lstatSync(path).size > 100000
      )
        continue;
      const markdown = readFileSync(path, "utf8");
      if (digest(markdown) === this.hashes[row.id]) continue;
      const body = markdown
        .match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)?.[1]
        ?.trim()
        .replace(/\[\[([a-f0-9-]{36})\|([^\]\n]+)\]\]/gi, (link, id, label) =>
          rows.some((m) => m.id === id) ? `[[${label}]]` : link,
        );
      if (body && body.length <= 20000 && body !== row.content) {
        if (
          this.bodies[row.id] &&
          digest(row.content) !== this.bodies[row.id]
        ) {
          // Both surfaces changed since the last sync: retain the external edit as a separate note.
          this.store.createMemory({
            projectId: row.projectId,
            content: `Markdown conflict / konflikt edycji\n${redact(body, 19900)}`,
            source: `markdown:conflict:${row.id}`,
            scope: "project",
          });
          continue;
        }
        // Only the body of already-owned notes is imported; a file cannot change scope/project.
        this.store.updateMemory({
          projectId: row.projectId,
          id: row.id,
          content: redact(body, 20000),
          scope: row.scope ?? "project",
          pinned: !!row.pinned,
        });
      }
    }
  }
  sync(): Promise<MemoryGraph> {
    if (this.pending) return this.pending;
    this.pending = this.perform().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async perform(): Promise<MemoryGraph> {
    if (this.stopped) throw Error("MEMORY_CLOSED");
    this.checkPaths();
    if (this.enabled) {
      for (const chat of this.store.chats.list()) this.capture(chat);
      for (const project of this.store.projects())
        for (const task of this.store.tasks(project.id)) {
          if (task.status !== "completed") continue;
          const run = this.store.runs.list(project.id, task.id)[0];
          const key = `task:${task.id}`;
          if (!run?.summary || this.seen[key] === run.updatedAt) continue;
          this.upsert(
            project.id,
            `auto:task:${task.id}`,
            `${task.title}\n\nCompleted task / zakończone zadanie · ${task.implementer}\n${redact(run.summary, 3000)}`,
          );
          this.seen[key] = run.updatedAt;
        }
    }
    this.importEdits(this.store.allMemory());
    const rows = this.store.allMemory();
    const projects = this.store.projects();
    const nodes: MemoryGraph["nodes"] = [
      ...projects.map((p) => ({
        id: `project:${p.id}`,
        label: p.name,
        kind: "project" as const,
        projectId: p.id,
        content: "",
        source: "workspace",
      })),
      ...rows.map((m) => ({
        id: `memory:${m.id}`,
        label: m.content.split(/\r?\n/)[0].slice(0, 90),
        kind: "memory" as const,
        projectId: m.projectId,
        memoryId: m.id,
        content: m.content,
        source: m.source,
      })),
    ];
    const edges = rows.map((m) => ({
      from: `project:${m.projectId}`,
      to: `memory:${m.id}`,
      relation: m.scope === "workspace" ? "shares" : "remembers",
    }));
    // Explicit wiki-links become real edges; ambiguous titles are deliberately not guessed.
    for (const row of rows)
      for (const match of row.content.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
        const candidates = nodes.filter(
          (n) =>
            n.id !== `memory:${row.id}` &&
            (n.label === match[1] || n.memoryId === match[1]),
        );
        if (candidates.length === 1)
          edges.push({
            from: `memory:${row.id}`,
            to: candidates[0].id,
            relation: "links_to",
          });
      }
    const wanted = nodes.map((n) => ({
      name: n.id,
      entityType: n.kind,
      observations: [
        ...new Set([n.label, n.content, n.source].filter(Boolean)),
      ],
    }));
    const graph = await this.engine.readGraph();
    const current = new Map(graph.entities.map((n) => [n.name, n]));
    const ids = new Set(wanted.map((n) => n.name));
    const removed = graph.entities
      .filter((n) => !ids.has(n.name))
      .map((n) => n.name);
    if (removed.length) await this.engine.deleteEntities(removed);
    const changed = wanted.filter(
      (n) =>
        current.has(n.name) &&
        JSON.stringify(current.get(n.name)!.observations) !==
          JSON.stringify(n.observations),
    );
    if (changed.length) {
      await this.engine.deleteObservations(
        changed.map((n) => ({
          entityName: n.name,
          observations: current.get(n.name)!.observations,
        })),
      );
      await this.engine.addObservations(
        changed.map((n) => ({ entityName: n.name, contents: n.observations })),
      );
    }
    const added = wanted.filter((n) => !current.has(n.name));
    if (added.length) await this.engine.createEntities(added);
    const relations = edges.map((e) => ({
      from: e.from,
      to: e.to,
      relationType: e.relation,
    }));
    const keys = new Set(relations.map((r) => JSON.stringify(r)));
    const removedRelations = graph.relations.filter(
      (r) => !keys.has(JSON.stringify(r)),
    );
    if (removedRelations.length)
      await this.engine.deleteRelations(removedRelations);
    const existingRelations = new Set(
      graph.relations.map((r) => JSON.stringify(r)),
    );
    const addedRelations = relations.filter(
      (r) => !existingRelations.has(JSON.stringify(r)),
    );
    if (addedRelations.length)
      await this.engine.createRelations(addedRelations);
    for (const row of rows) {
      const title =
        projects.find((p) => p.id === row.projectId)?.name ?? row.projectId;
      const linkedBody = row.content.replace(
        /\[\[([^\]\n]+)\]\]/g,
        (link, label) => {
          const candidates = rows.filter(
            (m) => m.content.split(/\r?\n/)[0].slice(0, 90) === label,
          );
          return candidates.length === 1
            ? `[[${candidates[0].id}|${label}]]`
            : link;
        },
      );
      const note = `---\nid: ${row.id}\nproject: ${JSON.stringify(title)}\nscope: ${row.scope ?? "project"}\nsource: ${JSON.stringify(row.source)}\n---\n${linkedBody}\n`;
      const hash = digest(note);
      if (hash !== this.hashes[row.id] || !existsSync(this.notePath(row.id)))
        writeFileSync(this.notePath(row.id), note);
      this.hashes[row.id] = hash;
      this.bodies[row.id] = digest(row.content);
    }
    for (const id of Object.keys(this.hashes))
      if (!rows.some((m) => m.id === id)) {
        const path = this.notePath(id);
        if (existsSync(path)) unlinkSync(path);
        delete this.hashes[id];
        delete this.bodies[id];
      }
    this.saveState();
    return {
      nodes,
      edges,
      enabled: this.enabled,
      directory: this.directory,
      engine: "MCP Knowledge Graph 2.0.0",
      syncedAt: new Date().toISOString(),
      status: "ready",
    };
  }
  start() {
    void this.sync().catch(() => {});
    this.timer = setInterval(() => void this.sync().catch(() => {}), 10000);
    this.timer.unref();
  }
  async close() {
    clearInterval(this.timer);
    await this.pending?.catch(() => {});
    this.stopped = true;
  }
}
