import React, { useEffect, useState } from "react";
import type { Agent, WorkspacePolicy } from "../shared";
import { AGENTS } from "../shared";
import { Icon, agentName } from "./ui";
import { ProviderIcon } from "./ProviderIcon";

const MESSAGES: Record<string, [string, string]> = {
  POLICY_AGENT_NOT_ALLOWED: [
    "Zasady pracy nie pozwalają uruchomić tego agenta. Zmień je w Połączeniach.",
    "Your workspace rules don't allow this agent. Change them in Connections.",
  ],
  POLICY_PAID_API_DISABLED: [
    "Płatne API jest wyłączone w zasadach pracy. Ten agent korzysta z OpenRouter.",
    "Paid API is turned off in your workspace rules. This agent uses OpenRouter.",
  ],
  POLICY_BUDGET_EXCEEDED: [
    "Miesięczny budżet płatnego API został wykorzystany. Podnieś go albo poczekaj do nowego miesiąca.",
    "The monthly paid API budget is used up. Raise it or wait for the next month.",
  ],
  POLICY_QUOTA_EXHAUSTED: [
    "Limit tego dostawcy jest wyczerpany. Poczekaj na reset albo wybierz innego agenta.",
    "This provider's limit is used up. Wait for the reset or choose another agent.",
  ],
  POLICY_APPROVAL_REQUIRED: [
    "Ten run korzysta z płatnego API. Zatwierdź go, aby kontynuować.",
    "This run uses a paid API. Approve it to continue.",
  ],
};
/** User-facing text for a POLICY_* code, or null for other codes. */
export function policyMessage(code: string, pl: boolean) {
  const key = Object.keys(MESSAGES).find((k) => code.includes(k));
  return key ? MESSAGES[key]![pl ? 0 : 1] : null;
}

/** Approve paid runs for one agent; the next attempt then passes the gate. */
export function PaidApproval({
  agent,
  pl,
  onApproved,
}: {
  agent: Agent;
  pl: boolean;
  onApproved?: () => void;
}) {
  const api = window.agenting!;
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  if (!api.policyApprove) return null;
  return (
    <button
      type="button"
      className="secondary"
      disabled={busy || done}
      onClick={() => {
        setBusy(true);
        void api.policyApprove!({ agent, consent: true })
          .then(() => {
            setDone(true);
            onApproved?.();
          })
          .finally(() => setBusy(false));
      }}
    >
      <Icon name={done ? "check" : "shield"} />
      {done
        ? pl
          ? "Zatwierdzono na 30 min — spróbuj ponownie"
          : "Approved for 30 min — try again"
        : pl
          ? `Zatwierdź płatne API dla ${agentName(agent)} (30 min)`
          : `Approve paid API for ${agentName(agent)} (30 min)`}
    </button>
  );
}

/** Workspace rules: which agents may run, paid API mode and a monthly cap. */
export function PolicyPanel({ language }: { language: "pl" | "en" }) {
  const api = window.agenting!,
    pl = language === "pl";
  const [policy, setPolicy] = useState<WorkspacePolicy | null>(null),
    [spent, setSpent] = useState<number | null>(null),
    [paidAgents, setPaidAgents] = useState<Agent[]>([]),
    [budget, setBudget] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void api
      .policyGet?.()
      .then((r) => {
        setPolicy(r.policy);
        setSpent(r.spentUsd);
        setPaidAgents(r.paidAgents);
        setBudget(
          r.policy.monthlyBudgetUsd === null
            ? ""
            : String(r.policy.monthlyBudgetUsd),
        );
      })
      .catch(() => setStatus("error"));
  }, []);
  if (!api.policyGet || !policy) return null;
  const parsed = budget.trim() === "" ? null : Number(budget);
  const budgetValid =
    parsed === null || (Number.isFinite(parsed) && parsed >= 0);
  const allowed = (id: Agent) =>
    !policy.allowedAgents.length || policy.allowedAgents.includes(id);
  const toggle = (id: Agent) => {
    const current = policy.allowedAgents.length
      ? policy.allowedAgents
      : [...AGENTS];
    const next = current.includes(id)
      ? current.filter((a) => a !== id)
      : [...current, id];
    // Every agent ticked means "no restriction".
    setPolicy({
      ...policy,
      allowedAgents: next.length === AGENTS.length ? [] : next,
    });
    setStatus("");
  };
  return (
    <section className="policy-panel" aria-labelledby="policy-title">
      <div className="router-heading">
        <span className="policy-mark">
          <Icon name="shield" />
        </span>
        <div>
          <h3 id="policy-title">
            {pl ? "Zasady pracy agentów" : "Agent work rules"}
          </h3>
          <p className="helper">
            {pl
              ? "Aplikacja egzekwuje je przed startem każdego agenta — w czacie, zadaniach, recenzji i u Mastera. Odpowiedź modelu nigdy nie jest zgodą."
              : "Enforced by the app before any agent starts — in chat, tasks, reviews and the Master. Model output is never consent."}
          </p>
        </div>
      </div>
      <fieldset className="policy-agents">
        <legend>{pl ? "Kto może pracować" : "Who may work"}</legend>
        {AGENTS.filter(id => id !== "gemini").map((id) => (
          <label key={id} className={allowed(id) ? "on" : ""}>
            <input
              type="checkbox"
              checked={allowed(id)}
              disabled={
                busy ||
                (allowed(id) &&
                  policy.allowedAgents.length === 1 &&
                  policy.allowedAgents[0] === id)
              }
              onChange={() => toggle(id)}
            />
            <ProviderIcon provider={id} />
            {agentName(id)}
          </label>
        ))}
      </fieldset>
      <fieldset className="policy-paid">
        <legend>
          {pl ? "Płatne API (za tokeny)" : "Paid API (per token)"}
          {!!paidAgents.length && (
            <small>
              {" · "}
              {paidAgents.map(agentName).join(", ")}
            </small>
          )}
        </legend>
        {(["deny", "ask", "allow"] as const).map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name="paid-api"
              checked={policy.paidApi === mode}
              disabled={busy}
              onChange={() => {
                setPolicy({ ...policy, paidApi: mode });
                setStatus("");
              }}
            />
            <span>
              <strong>
                {mode === "deny"
                  ? pl
                    ? "Zablokuj"
                    : "Block"
                  : mode === "ask"
                    ? pl
                      ? "Pytaj przed runem"
                      : "Ask before a run"
                    : pl
                      ? "Zezwalaj w ramach budżetu"
                      : "Allow within budget"}
              </strong>
              <small>
                {mode === "deny"
                  ? pl
                    ? "Żaden płatny run nie wystartuje."
                    : "No paid run starts."
                  : mode === "ask"
                    ? pl
                      ? "Zgoda na 30 minut na agenta, tylko w pamięci."
                      : "Approval lasts 30 minutes per agent, in memory only."
                    : pl
                      ? "Bez pytania, dopóki budżet nie jest wyczerpany."
                      : "No prompt until the budget is used up."}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="policy-budget">
        {pl
          ? "Miesięczny budżet płatnego API (USD)"
          : "Monthly paid API budget (USD)"}
        <input
          inputMode="decimal"
          placeholder={pl ? "bez limitu" : "no cap"}
          value={budget}
          aria-invalid={!budgetValid}
          disabled={busy}
          onChange={(e) => {
            setBudget(e.target.value.replace(",", "."));
            setStatus("");
          }}
        />
        <small>
          {spent === null
            ? pl
              ? "Wydatki w tym miesiącu: nieznane. Przy ustawionym budżecie każdy płatny run wymaga zatwierdzenia."
              : "Spend this month: unknown. With a budget set, every paid run needs approval."
            : pl
              ? `Wydatki w tym miesiącu wg OpenRouter: ${spent.toFixed(2)} USD`
              : `Spend this month per OpenRouter: ${spent.toFixed(2)} USD`}
        </small>
      </label>
      <div className="panel-actions">
        <button
          className="primary"
          disabled={busy || !budgetValid}
          onClick={() => {
            setBusy(true);
            void api.policySet!({
              allowedAgents: policy.allowedAgents,
              paidApi: policy.paidApi,
              monthlyBudgetUsd: parsed,
            })
              .then((saved) => {
                setPolicy(saved);
                setStatus("saved");
              })
              .catch(() => setStatus("error"))
              .finally(() => setBusy(false));
          }}
        >
          <Icon name="check" />
          {pl ? "Zapisz zasady" : "Save rules"}
        </button>
        {status && (
          <span
            role={status === "error" ? "alert" : "status"}
            className={status === "error" ? "error" : "success"}
          >
            {status === "error"
              ? pl
                ? "Nie udało się zapisać zasad."
                : "Could not save the rules."
              : pl
                ? "Zapisano. Wcześniejsze zgody na płatne API wygasły."
                : "Saved. Earlier paid API approvals were cleared."}
          </span>
        )}
      </div>
    </section>
  );
}
