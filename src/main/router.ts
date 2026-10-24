import {
  AVAILABLE_AGENTS as AGENTS,
  READ_ONLY_AGENTS,
  type Agent,
  type RoutingDecision,
  type RoutingMode,
} from "../shared.js";

/** Everything the router may know about one agent. Missing facts stay unknown. */
export interface RouteFacts {
  agent: Agent;
  configured: boolean;
  /** Last recorded connection check; null when none ran. */
  check: "connected" | "needs-auth" | "unavailable" | null;
  /** Provider quota status; "unknown" when there is no fresh reading. */
  quota: "active" | "warning" | "exhausted" | "unknown";
  /** Pay-per-token API run. */
  paid: boolean;
  /** Workspace policy verdict for this agent ("approve" = asks first). */
  policy: "allow" | "approve" | "deny";
  /** The policy rules behind a deny/approve verdict (POLICY_* codes). */
  policyReasons?: string[];
  /** Finished real runs and whether the latest attempt failed. */
  successes: number;
  lastFailed: boolean;
}
export interface RouteRequest {
  mode: RoutingMode;
  /** Implementer for a task or a reviewer of someone else's work. */
  role: "implementer" | "reviewer";
  /** The step must not edit files. Reviewers always need this. */
  readOnly: boolean;
  /** Reviewer diversity: the author is never its own reviewer. */
  author?: Agent;
  /** Manual mode only: the operator's choice. */
  preferred?: Agent;
  /** Optional task category supplied by the user, never inferred as a capability. */
  taskKind?: "general" | "writing" | "coding";
  /** Auto routing only considers checked, policy-approved subscription agents. */
  strict?: boolean;
}

/**
 * Deterministic and explainable: the same facts always give the same choice,
 * every point has a stated reason, and every rejected agent says why.
 * Nothing here is guessed — an unknown fact scores as unknown, never as good.
 */
export function route(
  request: RouteRequest,
  facts: RouteFacts[],
): RoutingDecision {
  const readOnly = request.readOnly || request.role === "reviewer";
  const ranked: RoutingDecision["ranked"] = [],
    rejected: RoutingDecision["rejected"] = [];
  for (const agent of AGENTS) {
    const f = facts.find((x) => x.agent === agent);
    const why: string[] = [];
    if (!f || !f.configured) why.push("NOT_CONFIGURED");
    else {
      if (f.check === "needs-auth") why.push("SIGN_IN_REQUIRED");
      if (f.check === "unavailable") why.push("UNAVAILABLE");
      if (request.strict && f.check === null) why.push("CONNECTION_UNCHECKED");
      if (request.strict && f.paid) why.push("PAID_REQUIRES_MANUAL_CHOICE");
      if (request.strict && f.policy === "approve") why.push("NEEDS_APPROVAL");
      if (readOnly && !READ_ONLY_AGENTS.includes(agent))
        why.push("NO_READ_ONLY_MODE");
      if (request.author === agent && request.role === "reviewer")
        why.push("SAME_AS_AUTHOR");
      if (f.quota === "exhausted") why.push("QUOTA_EXHAUSTED");
      if (f.policy === "deny")
        why.push("POLICY_DENIED", ...(f.policyReasons ?? []));
    }
    if (why.length) {
      rejected.push({ agent, reasons: why });
      continue;
    }
    const reasons: string[] = [];
    let score = 0;
    const add = (points: number, reason: string) => {
      score += points;
      reasons.push(`${points >= 0 ? "+" : ""}${points} ${reason}`);
    };
    if (f!.check === "connected") add(3, "CONNECTION_VERIFIED");
    else add(0, "CONNECTION_UNCHECKED");
    if ((request.taskKind === "writing" && agent === "claude") ||
        (request.taskKind === "coding" && agent === "codex"))
      add(4, "TASK_PREFERENCE");
    const proven = Math.min(f!.successes, 5);
    if (proven)
      add(
        request.mode === "quality-first" ? proven * 2 : proven,
        `FINISHED_RUNS_${f!.successes}`,
      );
    if (f!.lastFailed) add(-2, "LAST_RUN_FAILED");
    if (f!.quota === "active") add(1, "QUOTA_AVAILABLE");
    if (f!.quota === "warning") add(-2, "QUOTA_LOW");
    if (f!.quota === "unknown") add(-1, "QUOTA_UNKNOWN");
    if (f!.paid)
      add(
        request.mode === "subscription-first"
          ? -6
          : request.mode === "quality-first"
            ? 0
            : -2,
        "PAID_PER_TOKEN",
      );
    if (f!.policy === "approve") {
      add(-1, "NEEDS_APPROVAL");
      // Which rule asks first, e.g. unknown spend under a budget.
      for (const why of f!.policyReasons ?? [])
        if (why !== "POLICY_APPROVAL_REQUIRED") reasons.push(`0 ${why}`);
    }
    ranked.push({ agent, score, reasons });
  }
  // Stable order: score, then the fixed agent order, so ties never flip.
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      AGENTS.findIndex((id) => id === a.agent) -
        AGENTS.findIndex((id) => id === b.agent),
  );
  if (request.mode === "manual") {
    const pick = request.preferred;
    const ok = !!pick && ranked.some((r) => r.agent === pick);
    return {
      mode: request.mode,
      choice: ok ? pick! : null,
      ranked,
      rejected,
      reason: !pick
        ? "MANUAL_CHOICE_REQUIRED"
        : ok
          ? "MANUAL_CHOICE"
          : "MANUAL_CHOICE_REJECTED",
    };
  }
  return {
    mode: request.mode,
    choice: ranked[0]?.agent ?? null,
    ranked,
    rejected,
    reason: ranked.length ? "HIGHEST_SCORE" : "NO_ELIGIBLE_AGENT",
  };
}
