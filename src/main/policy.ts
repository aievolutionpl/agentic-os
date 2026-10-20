import type { DatabaseSync } from "node:sqlite";
import { AGENTS, type Agent, type WorkspacePolicy } from "../shared.js";
import { exact } from "./validate.js";

export const DEFAULT_POLICY: WorkspacePolicy = {
  allowedAgents: [],
  paidApi: "ask",
  monthlyBudgetUsd: null,
  updatedAt: null,
};

export type PolicyVerdict = {
  verdict: "allow" | "deny" | "approve";
  /** Stable codes; the first one is the error the caller raises. */
  reasons: string[];
};

/**
 * Pure decision. The application enforces it; model output is never consent.
 * Unknown spend is not zero: with a budget set, an unknown spend needs approval.
 */
export function evaluatePolicy(
  request: { agent: Agent; paid: boolean; approved: boolean },
  policy: WorkspacePolicy,
  spentUsd: number | null,
): PolicyVerdict {
  if (
    policy.allowedAgents.length &&
    !policy.allowedAgents.includes(request.agent)
  )
    return { verdict: "deny", reasons: ["POLICY_AGENT_NOT_ALLOWED"] };
  if (!request.paid) return { verdict: "allow", reasons: [] };
  if (policy.paidApi === "deny")
    return { verdict: "deny", reasons: ["POLICY_PAID_API_DISABLED"] };
  if (policy.monthlyBudgetUsd !== null) {
    if (spentUsd !== null && spentUsd >= policy.monthlyBudgetUsd)
      return { verdict: "deny", reasons: ["POLICY_BUDGET_EXCEEDED"] };
    if (spentUsd === null && !request.approved)
      return {
        verdict: "approve",
        reasons: ["POLICY_APPROVAL_REQUIRED", "POLICY_SPEND_UNKNOWN"],
      };
  }
  if (policy.paidApi === "ask" && !request.approved)
    return {
      verdict: "approve",
      reasons: ["POLICY_APPROVAL_REQUIRED", "POLICY_PAID_API"],
    };
  return { verdict: "allow", reasons: [] };
}

/** Workspace policy, one row. Schema v15. */
export class Policies {
  constructor(private db: DatabaseSync) {
    if (Number(db.prepare("PRAGMA user_version").get()!.user_version) !== 14)
      return;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS workspace_policy(id INTEGER PRIMARY KEY CHECK(id=1),allowedAgents TEXT NOT NULL,paidApi TEXT NOT NULL CHECK(paidApi IN ('deny','ask','allow')),monthlyBudgetUsd REAL,updatedAt TEXT NOT NULL);
        PRAGMA user_version=15;`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  get(): WorkspacePolicy {
    const row = this.db
      .prepare("SELECT * FROM workspace_policy WHERE id=1")
      .get();
    if (!row) return { ...DEFAULT_POLICY };
    const agents = JSON.parse(String(row.allowedAgents));
    return {
      allowedAgents: Array.isArray(agents)
        ? agents.filter((a): a is Agent => AGENTS.includes(a))
        : [],
      paidApi: row.paidApi as WorkspacePolicy["paidApi"],
      monthlyBudgetUsd:
        row.monthlyBudgetUsd == null ? null : Number(row.monthlyBudgetUsd),
      updatedAt: String(row.updatedAt),
    };
  }
  set(input: unknown, now = () => new Date().toISOString()) {
    const p = exact(input, ["allowedAgents", "paidApi", "monthlyBudgetUsd"]);
    if (
      !Array.isArray(p.allowedAgents) ||
      p.allowedAgents.length > AGENTS.length ||
      p.allowedAgents.some((a) => !AGENTS.includes(a as Agent)) ||
      new Set(p.allowedAgents).size !== p.allowedAgents.length ||
      !["deny", "ask", "allow"].includes(String(p.paidApi)) ||
      (p.monthlyBudgetUsd !== null &&
        (typeof p.monthlyBudgetUsd !== "number" ||
          !Number.isFinite(p.monthlyBudgetUsd) ||
          p.monthlyBudgetUsd < 0 ||
          p.monthlyBudgetUsd > 1_000_000))
    )
      throw Error("INVALID_INPUT");
    this.db
      .prepare(
        "INSERT INTO workspace_policy VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET allowedAgents=excluded.allowedAgents,paidApi=excluded.paidApi,monthlyBudgetUsd=excluded.monthlyBudgetUsd,updatedAt=excluded.updatedAt",
      )
      .run(
        JSON.stringify(p.allowedAgents),
        String(p.paidApi),
        p.monthlyBudgetUsd as number | null,
        now(),
      );
    return this.get();
  }
}

/**
 * Approval for paid runs, held in memory only and per agent: it expires, and it
 * is never written to disk, so a restart asks again.
 */
export class PaidApprovals {
  private granted = new Map<Agent, number>();
  constructor(
    private ttlMs = 30 * 60_000,
    private clock: () => number = Date.now,
  ) {}
  grant(agent: Agent) {
    this.granted.set(agent, this.clock() + this.ttlMs);
  }
  has(agent: Agent) {
    return (this.granted.get(agent) ?? 0) > this.clock();
  }
  revokeAll() {
    this.granted.clear();
  }
}
