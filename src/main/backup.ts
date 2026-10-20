import { DatabaseSync } from "node:sqlite";
import {
  copyFileSync,
  existsSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { SCHEMA_VERSION, type Store } from "./store.js";
import { redact } from "./validate.js";
import type { BackupSummary, Capability } from "../shared.js";

export const DATABASE = "agenting.sqlite";
const PENDING = `${DATABASE}.restore`;

/** Consistent snapshot of the live database, including committed WAL pages. */
export function createBackup(store: Store, target: string): BackupSummary {
  rmSync(target, { force: true });
  store.snapshot(target);
  return inspectBackup(target);
}

/** Read-only validation; a file that fails any check is never staged or opened for writing. */
export function inspectBackup(file: string): BackupSummary {
  if (!existsSync(file) || !statSync(file).isFile())
    throw Error("BACKUP_NOT_FOUND");
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const integrity = db.prepare("PRAGMA integrity_check").get();
    if (integrity?.integrity_check !== "ok") throw Error("BACKUP_CORRUPT");
    const schema = Number(
      db.prepare("PRAGMA user_version").get()!.user_version,
    );
    if (schema < 1 || schema > SCHEMA_VERSION)
      throw Error("BACKUP_UNSUPPORTED_SCHEMA");
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row) => String(row.name)),
    );
    for (const table of ["projects", "tasks", "memory", "preferences"])
      if (!tables.has(table)) throw Error("BACKUP_NOT_AGENTING");
    const count = (table: string) =>
      tables.has(table)
        ? Number(db!.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n)
        : 0;
    return {
      file: basename(file),
      schema,
      bytes: statSync(file).size,
      projects: count("projects"),
      tasks: count("tasks"),
      memory: count("memory"),
      runs: count("runs"),
      chats: count("chats"),
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code.startsWith("BACKUP_")) throw error;
    throw Error("BACKUP_CORRUPT");
  } finally {
    db?.close();
  }
}

/** Stage a validated copy; it replaces the database only at the next start. */
export function stageRestore(dataDir: string, file: string): BackupSummary {
  const summary = inspectBackup(file);
  const pending = join(dataDir, PENDING);
  copyFileSync(file, pending);
  inspectBackup(pending);
  return summary;
}

/**
 * Called before the store opens. The current database is kept beside the new
 * one, so a restore can always be undone by hand. A pending file that no longer
 * validates is set aside and the current data stays in use.
 */
export function applyPendingRestore(
  dataDir: string,
  now = Date.now,
): "none" | "restored" | "rejected" {
  const pending = join(dataDir, PENDING);
  if (!existsSync(pending)) return "none";
  try {
    inspectBackup(pending);
  } catch {
    renameSync(pending, `${pending}-rejected-${now()}`);
    return "rejected";
  }
  const current = join(dataDir, DATABASE),
    stamp = now();
  for (const suffix of ["", "-wal", "-shm"])
    if (existsSync(current + suffix))
      renameSync(
        current + suffix,
        `${current}.before-restore-${stamp}${suffix}`,
      );
  renameSync(pending, current);
  return "restored";
}

/** Metadata-only support bundle: no memory, chat, task or context text. */
export function diagnostics(
  store: Store,
  context: {
    version: string;
    platform: string;
    arch: string;
    versions: Record<string, string | undefined>;
    dataDir: string;
    capabilities: Capability[];
  },
) {
  const scrub = (value: string) =>
    redact(
      value.split(context.dataDir).join("<data>").split(homedir()).join("~"),
      400,
    );
  const facts = store.diagnostics();
  return {
    kind: "agenting-os-diagnostics",
    generatedAt: new Date().toISOString(),
    app: {
      version: context.version,
      platform: context.platform,
      arch: context.arch,
      electron: context.versions.electron ?? null,
      node: context.versions.node ?? null,
    },
    schema: facts.schema,
    counts: facts.counts,
    runStates: facts.runStates,
    batchStates: facts.batchStates,
    providers: facts.providers.map((p) => ({
      ...p,
      command: basename(p.command),
    })),
    capabilities: context.capabilities.map((c) => ({
      agent: c.agent,
      verdict: c.verdict,
      detected: c.detected,
      configured: c.configured,
      auth: c.auth,
      handshake: c.handshake,
      handshakeDetail: c.handshakeDetail,
      live: c.live,
      version: c.version,
    })),
    recentErrors: facts.recentErrors.map((e) => ({
      ...e,
      error: scrub(e.error),
    })),
    excluded: [
      "memory content",
      "chat messages",
      "task titles",
      "run context and output",
      "project paths",
      "credentials",
    ],
  };
}
