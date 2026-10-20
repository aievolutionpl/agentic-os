import type { Store } from "./store.js";
import type { Attention, AttentionItem } from "../shared.js";

const RUN_DECISIONS: Partial<Record<string, AttentionItem["kind"]>> = {
  awaiting_review: "run_review",
  interrupted: "run_interrupted",
  apply_uncertain: "apply_uncertain",
  failed: "run_failed",
};
const RUN_ACTIVE = new Set(["preparing", "running", "reviewing", "applying"]);
const MISSION_DECISIONS: Partial<Record<string, AttentionItem["kind"]>> = {
  ready: "mission_ready",
  blocked: "mission_blocked",
  interrupted: "mission_interrupted",
  needs_changes: "mission_needs_changes",
};
const MISSION_ACTIVE = new Set(["planning", "running", "evaluating"]);

/**
 * Read-only aggregation of everything waiting on the operator. It never acts:
 * every item links to the existing screen where the explicit decision is made.
 */
export function attention(store: Store, now = Date.now): Attention {
  const projects = new Map(store.projects().map((p) => [p.id, p.name]));
  const decisions: AttentionItem[] = [],
    active: AttentionItem[] = [];
  for (const run of store.runs.latestPerTask()) {
    const projectName = projects.get(run.projectId);
    if (projectName === undefined) continue;
    const item = {
      id: run.id,
      projectId: run.projectId,
      projectName,
      title: run.title,
      agent: run.provider,
      reason: run.error,
      at: run.updatedAt,
      target: "tasks" as const,
    };
    const kind = RUN_DECISIONS[run.state];
    if (kind) decisions.push({ ...item, kind });
    else if (RUN_ACTIVE.has(run.state))
      active.push({ ...item, kind: "run_active" });
  }
  for (const [projectId, projectName] of projects) {
    const batch = store.batches.latest(projectId);
    if (batch?.id) {
      const item = {
        id: batch.id,
        projectId,
        projectName,
        title: `${batch.finished}/${batch.taskIds.length}`,
        agent: null,
        reason: batch.reason,
        at: batch.updatedAt ?? 0,
        target: "tasks" as const,
      };
      if (batch.status === "interrupted")
        decisions.push({ ...item, kind: "batch_interrupted" });
      else if (
        batch.status === "blocked" &&
        batch.reason !== "HUMAN_APPROVAL_REQUIRED"
      )
        // Approval blocks already surface as the run awaiting review.
        decisions.push({ ...item, kind: "batch_blocked" });
      else if (batch.status === "running")
        active.push({ ...item, kind: "batch_running" });
    }
    for (const mission of store.missions.list(projectId)) {
      const item = {
        id: mission.id,
        projectId,
        projectName,
        title: mission.goal,
        agent: mission.master,
        reason: mission.reason,
        at: mission.updatedAt,
        target: "master" as const,
      };
      const kind = MISSION_DECISIONS[mission.status];
      if (kind) decisions.push({ ...item, kind });
      else if (MISSION_ACTIVE.has(mission.status))
        active.push({ ...item, kind: "mission_active" });
    }
  }
  const newest = (a: AttentionItem, b: AttentionItem) => b.at - a.at;
  return {
    observedAt: new Date(now()).toISOString(),
    decisions: decisions.sort(newest).slice(0, 100),
    active: active.sort(newest).slice(0, 50),
  };
}
