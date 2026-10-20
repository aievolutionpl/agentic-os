import { DatabaseSync } from "node:sqlite";
import {
  chmodSync,
  existsSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { SCHEMA_VERSION, type Store } from "./store.js";
import { redact } from "./validate.js";
import type { BackupSummary, Capability } from "../shared.js";

export const DATABASE = "agenting.sqlite";
const PENDING = `${DATABASE}.restore`;

/** Tables and columns each schema version must already have; missing ones are never recreated. */
const REQUIRED_TABLES: [number, string[]][] = [
  [1, ["projects", "tasks", "memory", "preferences"]],
  [2, ["task_dependencies", "task_events"]],
  [3, ["approval_records"]],
  [4, ["diff_artifacts"]],
  [6, ["runs", "run_events", "provider_settings"]],
  [7, ["memory_search"]],
  [8, ["extensions", "extension_events"]],
  [10, ["missions"]],
  [11, ["chats"]],
  [13, ["batches", "batch_events"]],
  [14, ["capability_checks"]],
];
const REQUIRED_COLUMNS: [number, string, string[]][] = [
  [9, "memory", ["scope"]],
  [9, "provider_settings", ["profile"]],
  [11, "memory", ["pinned", "updatedAt"]],
  [12, "provider_settings", ["model"]],
];

/** A fresh, unguessable sibling path; VACUUM INTO and "wx" both refuse an existing file. */
const partial = (path: string) => `${path}.${randomUUID()}.partial`;

/** True when both paths name the same file (or the live database's WAL/SHM companions). */
export function isLiveDatabase(target: string, live: string) {
  const canonical = (path: string) => {
    try {
      return realpathSync(path);
    } catch {
      // A target that does not exist yet: resolve its folder instead.
      try {
        return join(realpathSync(dirname(path)), basename(path));
      } catch {
        return resolve(path);
      }
    }
  };
  const key = (path: string) =>
    process.platform === "win32" ? path.toLowerCase() : path;
  const file = key(canonical(target)),
    database = key(canonical(live));
  return [database, `${database}-wal`, `${database}-shm`].includes(file);
}

/**
 * Consistent snapshot of the live database, including committed WAL pages.
 * It is written to a temporary file and moved into place, so a failed or
 * misdirected backup never removes an existing file first.
 */
export function createBackup(store: Store, target: string): BackupSummary {
  if (isLiveDatabase(target, store.file)) throw Error("BACKUP_TARGET_IS_LIVE");
  // Unpredictable name: another local account cannot pre-create it as a symlink.
  const temporary = partial(target);
  try {
    store.snapshot(temporary);
    // Backups hold every project, chat and memory entry: owner-only before publishing.
    chmodSync(temporary, 0o600);
    inspectBackup(temporary);
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
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
    for (const table of REQUIRED_TABLES[0]![1])
      if (!tables.has(table)) throw Error("BACKUP_NOT_AGENTING");
    for (const [version, names] of REQUIRED_TABLES)
      if (schema >= version && names.some((name) => !tables.has(name)))
        throw Error("BACKUP_INCOMPLETE");
    for (const [version, table, columns] of REQUIRED_COLUMNS) {
      if (schema < version) continue;
      const present = new Set(
        db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((row) => String(row.name)),
      );
      if (columns.some((column) => !present.has(column)))
        throw Error("BACKUP_INCOMPLETE");
    }
    // Opening with foreign keys on does not repair rows orphaned while they were off.
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw Error("BACKUP_INCONSISTENT");
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

/**
 * Stage a validated copy; it replaces the database only at the next start.
 * The copy goes through SQLite, so committed pages still in a WAL file are kept.
 */
export function stageRestore(dataDir: string, file: string): BackupSummary {
  if (isLiveDatabase(file, join(dataDir, DATABASE)))
    throw Error("BACKUP_SOURCE_IS_LIVE");
  inspectBackup(file);
  // Build beside the pending file and replace it only after the new copy validates,
  // so a failed second attempt keeps an earlier staged restore intact.
  const pending = join(dataDir, PENDING),
    temporary = partial(pending);
  try {
    const source = new DatabaseSync(file, { readOnly: true });
    try {
      source.prepare("VACUUM INTO ?").run(temporary);
    } finally {
      source.close();
    }
    chmodSync(temporary, 0o600);
    const summary = inspectBackup(temporary);
    renameSync(temporary, pending);
    return { ...summary, file: basename(file) };
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Write the diagnostics bundle, refusing the live database and replacing atomically. */
export function writeDiagnostics(
  target: string,
  live: string,
  bundle: unknown,
) {
  if (isLiveDatabase(target, live)) throw Error("BACKUP_TARGET_IS_LIVE");
  const temporary = partial(target);
  try {
    // "wx": fail instead of following or reusing anything already at that path.
    writeFileSync(temporary, JSON.stringify(bundle, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
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
    kept = `${current}.before-restore-${now()}`;
  if (existsSync(current)) {
    // One self-contained file (main + committed WAL pages), written before anything
    // is removed, so a crash part-way can never split the old database from its WAL.
    try {
      const old = new DatabaseSync(current, { readOnly: true });
      try {
        old.prepare("VACUUM INTO ?").run(kept);
      } finally {
        old.close();
      }
    } catch {
      // Unreadable old database: keep its raw files together under one name instead.
      for (const suffix of ["", "-wal", "-shm"])
        if (existsSync(current + suffix))
          renameSync(current + suffix, kept + suffix);
    }
  }
  // Companions first: a stray WAL must never be replayed onto the restored file.
  for (const suffix of ["-shm", "-wal", ""])
    rmSync(current + suffix, { force: true });
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
      // Both separators: a restored backup may carry another platform's path.
      command: p.command.split(/[\\/]/).pop() ?? "",
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
