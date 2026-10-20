import React, { useState } from "react";
import type { Agent, RoutingDecision, RoutingMode } from "../shared";
import { Icon, agentName } from "./ui";
import { ProviderIcon } from "./ProviderIcon";

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
    : (REASONS[code]?.[pl ? 0 : 1] ?? code);
  return points ? `${points} ${label}` : label;
}

/** Router preview for a new task: choose, explain, and let the operator apply. */
export function RoutePreview({
  language,
  disabled,
  onApply,
}: {
  language: "pl" | "en";
  disabled?: boolean;
  onApply: (implementer: Agent, reviewer: Agent) => void;
}) {
  const api = window.agenting!,
    pl = language === "pl";
  const [mode, setMode] = useState<Exclude<RoutingMode, "manual">>("balanced");
  const [result, setResult] = useState<{
    implementer: RoutingDecision;
    reviewer: RoutingDecision | null;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  if (!api.routePreview) return null;
  async function preview(next = mode) {
    setBusy(true);
    setFailed(false);
    try {
      const implementer = await api.routePreview!({
        mode: next,
        role: "implementer",
        readOnly: false,
      });
      const reviewer = implementer.choice
        ? await api.routePreview!({
            mode: next,
            role: "reviewer",
            readOnly: true,
            author: implementer.choice,
          })
        : null;
      setResult({ implementer, reviewer });
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
            if (result) void preview(next);
          }}
        >
          <option value="balanced">{pl ? "Zrównoważony" : "Balanced"}</option>
          <option value="subscription-first">
            {pl ? "Najpierw subskrypcje" : "Subscriptions first"}
          </option>
          <option value="quality-first">
            {pl ? "Najpierw jakość" : "Quality first"}
          </option>
        </select>
        <button
          type="button"
          className="secondary"
          disabled={disabled || busy}
          onClick={() => void preview()}
        >
          <Icon name={busy ? "refresh" : "search"} />
          {pl ? "Pokaż propozycję" : "Show proposal"}
        </button>
      </div>
      {failed && (
        <p className="inline-error" role="alert">
          {pl
            ? "Nie udało się przygotować propozycji."
            : "Could not prepare a proposal."}
        </p>
      )}
      {result && (
        <div className="route-result">
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
