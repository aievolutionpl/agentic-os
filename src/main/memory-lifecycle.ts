import type { DatabaseSync } from "node:sqlite";

/**
 * Schema v19: a memory note may expire (`expiresAt`, ISO time) or be replaced by a newer
 * note (`supersededBy`, id of the replacement). Nothing is deleted automatically: expired
 * and superseded notes stay visible in the Memory screen and in backups, but they are
 * left out of recall, pinned context and exports so stale facts stop steering agents.
 */
export function migrateMemoryLifecycle(db: DatabaseSync) {
  if (Number(db.prepare("PRAGMA user_version").get()!.user_version) !== 18)
    return;
  db.exec("BEGIN IMMEDIATE");
  try {
    const have = new Set(
      db
        .prepare("PRAGMA table_info(memory)")
        .all()
        .map((column) => String(column.name)),
    );
    if (!have.has("expiresAt")) db.exec("ALTER TABLE memory ADD COLUMN expiresAt TEXT");
    if (!have.has("supersededBy"))
      db.exec("ALTER TABLE memory ADD COLUMN supersededBy TEXT");
    db.exec("PRAGMA user_version=19");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** SQL predicate for notes that may still be used as context. Bind `nowIso` once. */
export const ACTIVE_MEMORY =
  "(m.expiresAt IS NULL OR m.expiresAt > ?) AND m.supersededBy IS NULL";

/** Parse a user-supplied expiry; it must be a real future instant, returned as ISO. */
export function parseExpiry(value: unknown, now: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 40) throw Error("INVALID_EXPIRY");
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at <= now) throw Error("INVALID_EXPIRY");
  return new Date(at).toISOString();
}
