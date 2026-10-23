import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ClaudeReading } from "./limit-bridge.js";

/** Anthropic's account endpoint used by /usage. Undocumented: fail closed,
 * retain the CLI fallback, and never refresh or copy the CLI's credentials. */
export function parseClaudeUsage(value: unknown, now = Date.now()): ClaudeReading | null {
  if (!value || typeof value !== "object") return null;
  const windows: ClaudeReading["windows"] = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!/^five_hour$|^seven_day(?:_[a-z0-9_]+)?$/.test(id) || !raw || typeof raw !== "object") continue;
    const w = raw as Record<string, unknown>;
    const reset = typeof w.resets_at === "string" ? Date.parse(w.resets_at) : NaN;
    if (typeof w.utilization !== "number" || !Number.isFinite(w.utilization) || w.utilization < 0 || w.utilization > 100 || !Number.isFinite(reset) || reset <= now) continue;
    windows[id] = { usedPercent: w.utilization, resetsAt: reset };
  }
  return Object.keys(windows).length ? { at: now, windows } : null;
}

export class ClaudeUsage {
  private cached: ClaudeReading | null = null;
  private nextRead = 0;
  private pending?: Promise<ClaudeReading | null>;
  constructor(private directory = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), private request: typeof fetch = fetch) {}
  read(): Promise<ClaudeReading | null> {
    if (this.pending) return this.pending;
    if (Date.now() < this.nextRead) return Promise.resolve(this.cached);
    this.pending = this.load().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async load(): Promise<ClaudeReading | null> {
    // Shared by all dashboard/chat requests; no automatic rapid retries.
    this.nextRead = Date.now() + 5 * 60000;
    try {
      const auth = JSON.parse(readFileSync(join(this.directory, ".credentials.json"), "utf8"))?.claudeAiOauth;
      if (typeof auth?.accessToken !== "string" || !auth.accessToken || (typeof auth.expiresAt === "number" && auth.expiresAt <= Date.now())) return null;
      const response = await this.request("https://api.anthropic.com/api/oauth/usage", {
        headers: { Authorization: `Bearer ${auth.accessToken}`, "anthropic-beta": "oauth-2025-04-20", Accept: "application/json" },
        redirect: "error", signal: AbortSignal.timeout(8000),
      });
      if (response.status === 429) this.nextRead = Date.now() + 15 * 60000;
      if (!response.ok) return this.cached;
      this.cached = parseClaudeUsage(await response.json());
      return this.cached;
    } catch { return this.cached; }
  }
}
