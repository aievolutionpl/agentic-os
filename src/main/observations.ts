import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProviderObservation } from "./cli-provider.js";

/** What a provider reported about itself during real runs: limit windows and token counts. */
export interface ProviderObservations {
  limits: Record<
    string,
    {
      status: string;
      resetsAt: number | null;
      utilization: number | null;
      observedAt: number;
    }
  >;
  /** Provider-reported tokens per local calendar day (YYYY-MM-DD), last 30 days. */
  tokens: Record<string, number>;
  updatedAt: number;
}

const FILE = "provider-observations.json";

export function readObservations(
  dir: string,
): Record<string, ProviderObservations> {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, FILE), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const day = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function recordObservation(
  dir: string,
  agent: string,
  observation: ProviderObservation,
  now = Date.now(),
) {
  const all = readObservations(dir);
  const entry: ProviderObservations = all[agent] ?? {
    limits: {},
    tokens: {},
    updatedAt: now,
  };
  if (observation.kind === "limit")
    entry.limits[observation.window] = {
      status: observation.status,
      resetsAt: observation.resetsAt,
      utilization: observation.utilization,
      observedAt: now,
    };
  else {
    const key = day(now);
    entry.tokens[key] = (entry.tokens[key] ?? 0) + observation.total;
    for (const old of Object.keys(entry.tokens).sort().slice(0, -30))
      delete entry.tokens[old];
  }
  entry.updatedAt = now;
  all[agent] = entry;
  const temporary = join(dir, `${FILE}.${process.pid}.tmp`);
  writeFileSync(temporary, JSON.stringify(all));
  renameSync(temporary, join(dir, FILE));
}

export { day as localDay };
