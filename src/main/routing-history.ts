import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { RoutingDecision, RoutingHistoryEntry } from "../shared.js";

/** Bounded local audit trail. Never stores task text or raw model output. */
export class RoutingHistory {
  private rows: RoutingHistoryEntry[] = [];
  private path: string;
  constructor(directory: string) {
    this.path = join(directory, "routing-history.json");
    try {
      const rows = JSON.parse(readFileSync(this.path, "utf8"));
      if (Array.isArray(rows)) this.rows = rows.filter(row => row && typeof row.id === "string" && typeof row.at === "string" && row.decision && typeof row.decision.reason === "string").slice(0, 100);
    } catch { /* New or damaged history must not prevent application startup. */ }
  }
  list() { return this.rows.slice(0, 100); }
  record(decision: RoutingDecision): RoutingDecision {
    const rows = [{ id: randomUUID(), at: new Date().toISOString(), decision }, ...this.rows].slice(0, 100);
    writeFileSync(`${this.path}.tmp`, JSON.stringify(rows), { mode: 0o600 });
    renameSync(`${this.path}.tmp`, this.path);
    this.rows = rows;
    return decision;
  }
}
