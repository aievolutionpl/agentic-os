import React, { useEffect, useRef, useState } from "react";
import { READ_ONLY_AGENTS, type Agent, type ProviderSetting, type RoutingDecision, type RoutingMode, type RoutingHistoryEntry } from "../shared";
import { ModelPicker } from "./ModelPicker";
import { Icon, agentName } from "./ui";
import { ProviderIcon } from "./ProviderIcon";
import { policyMessage } from "./PolicyPanel";

const REASONS: Record<string, [string, string]> = {
  NOT_CONFIGURED: ["niepodłączony", "not connected"],
  SIGN_IN_REQUIRED: ["wymaga logowania", "needs sign-in"],
  UNAVAILABLE: ["niedostępny", "unavailable"],
  NO_READ_ONLY_MODE: ["brak trybu tylko do odczytu", "no read-only mode"],
  SAME_AS_AUTHOR: [
    "autor nie recenzuje sam siebie",
    "author can't self-review",
  ],
  QUOTA_EXHAUSTED: ["limit wyczerpany", "quota exhausted"],
  POLICY_DENIED: ["zablokowany w zasadach", "blocked by rules"],
  CONNECTION_VERIFIED: ["połączenie sprawdzone", "connection verified"],
  CONNECTION_UNCHECKED: ["połączenie niesprawdzone", "connection unchecked"],
  LAST_RUN_FAILED: ["ostatni run nieudany", "last run failed"],
  QUOTA_AVAILABLE: ["limit dostępny", "quota available"],
  QUOTA_LOW: ["limit na wyczerpaniu", "quota low"],
  QUOTA_UNKNOWN: ["limit nieznany", "quota unknown"],
  PAID_PER_TOKEN: ["płatne za tokeny", "paid per token"],
  NEEDS_APPROVAL: ["wymaga zgody", "needs approval"],
  TASK_PREFERENCE: ["preferowany dla tego zadania", "preferred for this task"],
  PAID_REQUIRES_MANUAL_CHOICE: ["płatne API wymaga ręcznego wyboru", "paid API requires manual choice"],
};
/** "+3 CONNECTION_VERIFIED" → "+3 połączenie sprawdzone". */
export function reasonText(reason: string, pl: boolean) {
  const [points, code] = reason.includes(" ")
    ? [
        reason.slice(0, reason.indexOf(" ")),
        reason.slice(reason.indexOf(" ") + 1),
      ]
    : ["", reason];
  const runs = /^FINISHED_RUNS_(\d+)$/.exec(code);
  const label = runs
    ? pl
      ? `ukończone runy: ${runs[1]}`
      : `finished runs: ${runs[1]}`
    : (REASONS[code]?.[pl ? 0 : 1] ??
      (code.startsWith("POLICY_") ? policyMessage(code, pl) : null) ??
      code);
  return points ? `${points} ${label}` : label;
}

/** Router preview for a new task: choose, explain, and let the operator apply. */
export function RoutePreview({
  language,
  disabled,
  current,
  currentReviewer,
  onApply,
  task = "",
}: {
  language: "pl" | "en";
  disabled?: boolean;
  /** The implementer already chosen in the form; Manual mode checks it. */
  current?: Agent;
  currentReviewer?: Agent;
  onApply: (implementer: Agent, reviewer: Agent) => void;
  task?: string;
}) {
  const api = window.agenting!,
    pl = language === "pl";
  const [mode, setMode] = useState<RoutingMode>("balanced");
  const [taskKind, setTaskKind] = useState<"general" | "writing" | "coding">("general");
  const [jevEnabled, setJevEnabled] = useState(false);
  const [jevAgent, setJevAgent] = useState<Agent>("codex");
  const [jevModel, setJevModel] = useState("");
  const [providers, setProviders] = useState<ProviderSetting[]>([]);
  const [history, setHistory] = useState<RoutingHistoryEntry[]>([]);
  const revision = useRef(0);
  const [result, setResult] = useState<{
    implementer: RoutingDecision;
    reviewer: RoutingDecision | null;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void api.providerSettings?.().then(rows => { if (live) setProviders(rows); }).catch(() => {});
    void api.routingHistory?.().then(rows => { if (live) setHistory(rows); }).catch(() => {});
    return () => { live = false; };
  }, [api]);
  useEffect(() => {
    revision.current++;
    setResult(null);
  }, [task, taskKind, mode, jevEnabled, jevAgent, jevModel, current, currentReviewer]);
  if (!api.routePreview) return null;
  async function preview(next = mode) {
    const epoch = revision.current;
    setBusy(true);
    setFailed(false);
    try {
      const implementer = await api.routePreview!({
        mode: next,
        role: "implementer",
        readOnly: false,
        taskKind,
        strict: next !== "manual",
        ...(jevEnabled && next !== "manual" ? {
          task: task.slice(0, 4000), jev: { agent: jevAgent, model: jevModel, consent: true as const },
        } : {}),
        ...(next === "manual" && current ? { preferred: current } : {}),
      });
      const reviewer = implementer.choice
        ? await api.routePreview!({
            mode: next,
            role: "reviewer",
            readOnly: true,
            author: implementer.choice,
            strict: next !== "manual",
            ...(next === "manual" && currentReviewer
              ? { preferred: currentReviewer }
              : {}),
          })
        : null;
      if (epoch === revision.current) setResult({ implementer, reviewer });
      void api.routingHistory?.().then(setHistory).catch(() => {});
    } catch {
      // A stale proposal from another mode must not stay applicable.
      setResult(null);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  const row = (label: string, d: RoutingDecision | null) => {
    const top = d?.ranked.find((r) => r.agent === d.choice);
    return (
      <div className="route-row">
        <span className="route-role">{label}</span>
        {d?.choice ? (
          <>
            <ProviderIcon provider={d.choice} />
            <strong>{agentName(d.choice)}</strong>
            <small>
              {top?.reasons.map((r) => reasonText(r, pl)).join(" · ")}
            </small>
          </>
        ) : (
          <small className="route-none">
            {pl
              ? "Brak agenta spełniającego warunki."
              : "No agent meets the requirements."}
          </small>
        )}
      </div>
    );
  };
  return (
    <div className="route-preview" aria-live="polite">
      <div className="route-head">
        <Icon name="spark" />
        <span>{pl ? "Dobierz agentów" : "Pick agents"}</span>
        <select
          aria-label={pl ? "Tryb doboru" : "Routing mode"}
          value={mode}
          disabled={disabled || busy}
          onChange={(e) => {
            const next = e.target.value as typeof mode;
            setMode(next);
          }}
        >
          <option value="balanced">{pl ? "Zrównoważony" : "Balanced"}</option>
          <option value="subscription-first">
            {pl ? "Najpierw subskrypcje" : "Subscriptions first"}
          </option>
          <option value="quality-first">
            {pl ? "Najpierw jakość" : "Quality first"}
          </option>
          <option value="manual">
            {pl ? "Ręcznie: sprawdź wybór" : "Manual: check my choice"}
          </option>
        </select>
        <button
          type="button"
          className="secondary"
          disabled={disabled || busy || (jevEnabled && mode !== "manual" && (!jevModel || !task.trim()))}
          onClick={() => void preview()}
        >
          <Icon name={busy ? "refresh" : "search"} />
          {pl ? "Pokaż propozycję" : "Show proposal"}
        </button>
      </div>
      <details className="route-options">
        <summary>{pl ? "Preferencje zadania i model Jev" : "Task preferences and Jev decision model"}</summary>
        <label>{pl ? "Rodzaj pracy" : "Task type"}
          <select value={taskKind} disabled={busy} onChange={e => setTaskKind(e.target.value as typeof taskKind)}>
            <option value="general">{pl ? "Ogólne" : "General"}</option>
            <option value="writing">{pl ? "Pisanie · preferuj Claude" : "Writing · prefer Claude"}</option>
            <option value="coding">{pl ? "Kod · preferuj Codex" : "Coding · prefer Codex"}</option>
          </select>
        </label>
        <label><input type="checkbox" checked={jevEnabled} disabled={busy || mode === "manual"} onChange={e => setJevEnabled(e.target.checked)} />
          {pl ? "Jev · użyj modelu decyzyjnego" : "Jev · use a decision model"}
        </label>
        {jevEnabled && <>
          <p>{pl ? "„Pokaż propozycję” wyśle treść zadania do wybranego modelu (zużywa limit). Jedno wywołanie, maks. 45 s; przy błędzie zadziałają reguły. Jev nie wykonuje zadania ani nie zmienia uprawnień." : "Show proposal sends task text to this model (uses quota). One call, up to 45 seconds; rules handle failures. Jev does not execute the task or change permissions."}</p>
          <select aria-label={pl ? "Dostawca modelu Jev" : "Jev provider"} value={jevAgent} disabled={busy} onChange={e => { setJevAgent(e.target.value as Agent); setJevModel(""); }}>
            {providers.filter(p => p.configured && READ_ONLY_AGENTS.includes(p.id) && p.id !== "gemini" && p.id !== "opencode").map(p => <option key={p.id} value={p.id}>{agentName(p.id)}</option>)}
          </select>
          <ModelPicker agent={jevAgent} value={jevModel} provider={providers.find(p => p.id === jevAgent)} pl={pl} disabled={busy} onChange={setJevModel} />
        </>}
      </details>
      {!!history.length && <details><summary>{pl ? "Ostatnie decyzje" : "Recent decisions"}</summary>
        <ul>{history.slice(0, 8).map(row => <li key={row.id}>
          <time>{new Date(row.at).toLocaleTimeString(pl ? "pl-PL" : "en-GB")}</time>{" · "}
          {row.decision.choice ? agentName(row.decision.choice) : (pl ? "Bez wyboru" : "No choice")}{" · "}
          {row.decision.reason === "JEV_RULE_FALLBACK" ? (pl ? "reguły awaryjne" : "rule fallback") : row.decision.reason === "JEV_VALIDATED_CHOICE" ? "Jev" : (pl ? "reguły / wybór ręczny" : "rules / manual choice")}
        </li>)}</ul>
      </details>}
      {failed && (
        <p className="inline-error" role="alert">
          {pl
            ? "Nie udało się przygotować propozycji."
            : "Could not prepare a proposal."}
        </p>
      )}
      {result && (
        <div className="route-result">
          {result.implementer.reason.startsWith("JEV_") && <p role="status">{({
            JEV_VALIDATED_CHOICE: pl ? "Jev: wybór sprawdzony względem dostępnych agentów." : "Jev: choice validated against eligible agents.",
            JEV_RULE_FALLBACK: pl ? "Jev niedostępny lub odpowiedź niepoprawna — zastosowano reguły." : "Jev unavailable or invalid response — rules applied.",
            JEV_CLARIFICATION_REQUIRED: pl ? "Jev potrzebuje dokładniejszego opisu. Doprecyzuj zadanie lub wybierz agenta ręcznie." : "Jev needs more context. Refine the task or choose an agent manually.",
          } as Record<string, string>)[result.implementer.reason]}</p>}
          {row(pl ? "Wykonawca" : "Implementer", result.implementer)}
          {row(pl ? "Recenzent" : "Reviewer", result.reviewer)}
          {(
            [
              [pl ? "Wykonawca" : "Implementer", result.implementer],
              [pl ? "Recenzent" : "Reviewer", result.reviewer],
            ] as const
          ).map(
            ([label, decision]) =>
              !!decision?.rejected.length && (
                <details key={label}>
                  <summary>
                    {label} · {pl ? "odrzuceni" : "not eligible"} ·{" "}
                    {decision.rejected.length}
                  </summary>
                  <ul>
                    {decision.rejected.map((r) => (
                      <li key={r.agent}>
                        <strong>{agentName(r.agent)}</strong>{" "}
                        {r.reasons.map((x) => reasonText(x, pl)).join(", ")}
                      </li>
                    ))}
                  </ul>
                </details>
              ),
          )}
          <button
            type="button"
            className="primary"
            disabled={
              disabled ||
              busy ||
              !result.implementer.choice ||
              !result.reviewer?.choice
            }
            onClick={() =>
              onApply(result.implementer.choice!, result.reviewer!.choice!)
            }
          >
            <Icon name="check" />
            {pl ? "Użyj tej propozycji" : "Use this proposal"}
          </button>
        </div>
      )}
    </div>
  );
}
