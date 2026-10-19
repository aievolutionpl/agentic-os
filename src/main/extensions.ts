import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { realpathSync, statSync } from "node:fs";
import { exact, object, text, redact } from "./validate.js";
import type { ContextSkill } from "./knowledge.js";
import { RpcProcess } from "./rpc.js";
import type { Extension, McpTool } from "../shared.js";

const BUILTINS: Extension[] = [
  {
    id: "builtin:review",
    kind: "skill",
    name: "Evidence-based review",
    version: "1.0.0",
    author: "AI Evolution Polska",
    license: "Apache-2.0",
    source: "agenting-os/builtin",
    instructions:
      "Review correctness, permissions, data preservation and failure handling. Cite affected files. Distinguish observed failures from hypotheses. Report checks actually run and any remaining gaps.",
  },
  {
    id: "builtin:ui",
    kind: "skill",
    name: "Accessible UI",
    version: "1.0.0",
    author: "AI Evolution Polska",
    license: "Apache-2.0",
    source: "agenting-os/builtin",
    instructions:
      "Reuse existing design tokens and components. Check keyboard focus, labels, contrast, responsive overflow, loading, empty and error states. Keep content readable and actions explicit. Verify changes with the project's existing checks.",
  },
];
export class Extensions {
  constructor(private db: DatabaseSync) {
    if (Number(db.prepare("PRAGMA user_version").get()!.user_version) === 7)
      db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE extensions(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),manifest TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE INDEX extensions_scope ON extensions(projectId);
      CREATE TABLE extension_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,projectId TEXT NOT NULL REFERENCES projects(id),extensionId TEXT NOT NULL,action TEXT NOT NULL,at TEXT NOT NULL);
      PRAGMA user_version=8;COMMIT;`);
  }
  private project(id: unknown): string {
    const projectId = text(id);
    if (!this.db.prepare("SELECT id FROM projects WHERE id=?").get(projectId))
      throw Error("PROJECT_NOT_FOUND");
    return projectId;
  }
  list(projectId: string): Extension[] {
    this.project(projectId);
    return [
      ...BUILTINS,
      ...this.db
        .prepare(
          "SELECT id,manifest FROM extensions WHERE projectId=? ORDER BY createdAt,id",
        )
        .all(projectId)
        .map((row) => ({
          ...JSON.parse(String(row.manifest)),
          id: String(row.id),
        })),
    ];
  }
  get(projectId: string, id: string) {
    const extension = this.list(projectId).find((item) => item.id === text(id));
    if (!extension) throw Error("EXTENSION_NOT_FOUND");
    return extension;
  }
  import(input: unknown) {
    const p = exact(input, ["projectId", "manifest", "consent"]),
      projectId = this.project(p.projectId);
    if (p.consent !== true) throw Error("EXPLICIT_TRUST_REQUIRED");
    const raw = text(p.manifest, 32000),
      value = object(JSON.parse(raw));
    const m = exact(value, [
      "kind",
      "name",
      "version",
      "author",
      "license",
      "source",
      ...(value.kind === "skill" ? ["instructions"] : ["command", "args"]),
    ]);
    if (m.kind !== "skill" && m.kind !== "mcp") throw Error("INVALID_KIND");
    const manifest: Omit<Extension, "id"> = {
      kind: m.kind,
      name: text(m.name, 120),
      version: text(m.version, 80),
      author: text(m.author, 120),
      license: text(m.license, 120),
      source: text(m.source, 1000),
    };
    if (m.kind === "skill") manifest.instructions = text(m.instructions, 12000);
    else {
      const command = text(m.command, 4096);
      if (
        !isAbsolute(command) ||
        /\.(cmd|bat|ps1)$/i.test(command) ||
        !statSync(realpathSync.native(command)).isFile()
      )
        throw Error("EXECUTABLE_REQUIRED");
      if (!Array.isArray(m.args) || m.args.length > 20)
        throw Error("INVALID_ARGUMENTS");
      manifest.command = command;
      manifest.args = m.args.map((arg) => text(arg, 2048, true));
      if (
        redact(JSON.stringify(manifest), 100000) !== JSON.stringify(manifest) ||
        manifest.args.some((arg) =>
          /(?:api[-_]?key|token|password|secret)(?:=|$)/i.test(arg),
        )
      )
        throw Error("CREDENTIALS_NOT_ALLOWED");
    }
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO extensions VALUES(?,?,?,?)")
      .run(id, projectId, JSON.stringify(manifest), new Date().toISOString());
    this.event(projectId, id, "imported");
    return { ...manifest, id };
  }
  remove(projectId: string, id: string) {
    this.project(projectId);
    if (
      !this.db
        .prepare("DELETE FROM extensions WHERE projectId=? AND id=?")
        .run(projectId, text(id)).changes
    )
      throw Error("EXTENSION_NOT_FOUND");
    this.event(projectId, id, "removed");
  }
  skills(projectId: string, ids: unknown): ContextSkill[] {
    if (
      !Array.isArray(ids) ||
      ids.length > 10 ||
      new Set(ids).size !== ids.length
    )
      throw Error("INVALID_SKILLS");
    return ids.map((id) => {
      const item = this.get(projectId, text(id));
      if (item.kind !== "skill") throw Error("INVALID_SKILLS");
      return {
        id: item.id,
        name: item.name,
        version: item.version,
        source: item.source,
        license: item.license,
        instructions: item.instructions!,
      };
    });
  }
  event(projectId: string, id: string, action: string) {
    this.db
      .prepare(
        "INSERT INTO extension_events(projectId,extensionId,action,at) VALUES(?,?,?,?)",
      )
      .run(projectId, id, action, new Date().toISOString());
    this.db
      .prepare(
        "DELETE FROM extension_events WHERE projectId=? AND seq NOT IN (SELECT seq FROM extension_events WHERE projectId=? ORDER BY seq DESC LIMIT 200)",
      )
      .run(projectId, projectId);
  }
}
export class McpTools {
  private stopping = new Map<string,RpcProcess>();
  private clients = new Map<
    string,
    { rpc: RpcProcess; tools: McpTool[]; busy: boolean }
  >();
  constructor(
    private extensions: Extensions,
    private cwd: string,
  ) {}
  private key(projectId: string, id: string) {
    return `${projectId}/${id}`;
  }
  async connect(input: unknown) {
    const p = exact(input, ["projectId", "id", "consent"]),
      projectId = text(p.projectId),
      id = text(p.id);
    if (p.consent !== true) throw Error("EXPLICIT_TRUST_REQUIRED");
    const manifest = this.extensions.get(projectId, id);
    if (manifest.kind !== "mcp") throw Error("MCP_REQUIRED");
    const key = this.key(projectId, id);
    if(this.stopping.has(key))throw Error("STOP_NOT_CONFIRMED");
    if (this.clients.has(key)) {
      const existing = this.clients.get(key)!;
      if (existing.busy) throw Error("TOOL_NOT_READY");
      return existing.tools;
    }
    if (this.clients.size+this.stopping.size >= 4) throw Error("CONNECTION_LIMIT");
    const rpc = new RpcProcess({
      command: manifest.command!,
      args: manifest.args!,
      cwd: this.cwd,
    });
    const client = { rpc, tools: [] as McpTool[], busy: true };
    this.clients.set(key, client);
    rpc.on("request", (message) =>
      message.method === "ping"
        ? rpc.respond(message.id, {})
        : rpc.reject(message.id),
    );
    rpc.on("closed", () => {
      if(this.stopping.get(key)===rpc)this.stopping.delete(key);
      if (this.clients.get(key) === client) this.clients.delete(key);
    });
    try {
      const init = object(
        await rpc.request("initialize", {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "agenting-os", version: "0.4.0" },
        }),
      );
      if (
        init.protocolVersion !== "2025-11-25" ||
        !object(init.capabilities).tools
      )
        throw Error("UNSUPPORTED_MCP");
      rpc.notify("notifications/initialized");
      let cursor: string | undefined;
      const cursors = new Set<string>();
      for (let page = 0; page < 10; page++) {
        const result = object(
          await rpc.request("tools/list", cursor ? { cursor } : {}),
        );
        if (!Array.isArray(result.tools)) throw Error("INVALID_TOOLS");
        for (const raw of result.tools) {
          const tool = object(raw),
            name = text(tool.name, 128),
            schema = object(tool.inputSchema);
          if (
            client.tools.some((t) => t.name === name) ||
            client.tools.length >= 200 ||
            JSON.stringify(schema).length > 16000
          )
            throw Error("TOOL_LIMIT");
          client.tools.push({
            name,
            description: redact(
              typeof tool.description === "string" ? tool.description : "",
            ).slice(0, 4000),
            inputSchema: schema,
          });
        }
        if (!result.nextCursor) {
          client.busy = false;
          this.extensions.event(projectId, id, "connected");
          return client.tools;
        }
        cursor = text(result.nextCursor, 2048);
        if (cursors.has(cursor)) throw Error("PAGINATION_LOOP");
        cursors.add(cursor);
      }
      throw Error("TOOL_LIMIT");
    } catch (error) {
      await this.disconnect(projectId, id);
      throw error;
    }
  }
  async call(input: unknown) {
    const p = exact(input, ["projectId", "id", "name", "arguments", "consent"]),
      projectId = text(p.projectId),
      id = text(p.id),
      name = text(p.name, 128);
    if (p.consent !== true) throw Error("EXPLICIT_CALL_REQUIRED");
    this.extensions.get(projectId, id);
    const client = this.clients.get(this.key(projectId, id));
    if (!client || client.busy || !client.tools.some((t) => t.name === name))
      throw Error("TOOL_NOT_READY");
    const args = object(p.arguments);
    if (JSON.stringify(args).length > 16000) throw Error("ARGUMENT_LIMIT");
    client.busy = true;
    this.extensions.event(projectId, id, `call:${name}:started`);
    try {
      const result = object(
        await client.rpc.request(
          "tools/call",
          { name, arguments: args },
          60000,
        ),
      );
      if (!Array.isArray(result.content) || result.content.length > 100)
        throw Error("INVALID_RESULT");
      const content = result.content
        .map((raw) => {
          const block = object(raw);
          return block.type === "text"
            ? text(block.text, 100000, true)
            : "[Non-text result omitted]";
        })
        .join("\n");
      this.extensions.event(
        projectId,
        id,
        `call:${name}:${result.isError === true ? "error" : "completed"}`,
      );
      return { isError: result.isError === true, text: redact(content, 32000) };
    } catch (error) {
      this.extensions.event(projectId, id, `call:${name}:failed`);
      await this.disconnect(projectId, id);
      throw error;
    } finally {
      client.busy = false;
    }
  }
  async disconnect(projectId: string, id: string) {
    const key = this.key(projectId, id),
      client = this.clients.get(key);
    this.clients.delete(key);
    const rpc=client?.rpc ?? this.stopping.get(key);
    if(!rpc)return;
    this.stopping.set(key,rpc);
    rpc.close();
    if(!await rpc.waitClosed())throw Error("STOP_NOT_CONFIRMED");
    if(this.stopping.get(key)===rpc)this.stopping.delete(key);
  }
  async close() {
    const clients = [...new Set([...this.clients.values()].map(c=>c.rpc).concat([...this.stopping.values()]))];
    this.clients.clear();
    for (const rpc of clients) rpc.close();
    await Promise.all(clients.map((rpc) => rpc.waitClosed()));
  }
}
