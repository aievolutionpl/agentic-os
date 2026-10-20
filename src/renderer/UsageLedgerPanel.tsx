import React, { useEffect, useState } from "react";
import type { UsageEntry, UsageSummary } from "../shared";
import { agentName, relativeTime } from "./ui";
import { ProviderIcon } from "./ProviderIcon";

/** Per-agent usage measured by this app. Unknown is shown as unknown. */
export function UsageLedgerPanel({ language }: { language: "pl" | "en" }) {
  const api = window.agenting!,
    pl = language === "pl";
  const [data, setData] = useState<{
    summary: UsageSummary[];
    recent: UsageEntry[];
  } | null>(null);
  useEffect(() => {
    void api
      .usageReport?.()
      .then(setData)
      .catch(() => setData({ summary: [], recent: [] }));
  }, []);
  if (!api.usageReport || !data) return null;
  const n = (v: number | null) =>
    v === null
      ? pl
        ? "nieznane"
        : "unknown"
      : new Intl.NumberFormat(language).format(v);
  const roles: Record<UsageEntry["role"], [string, string]> = {
    implementer: ["zadanie", "task"],
    reviewer: ["recenzja", "review"],
    chat: ["czat", "chat"],
    master: ["Master", "Master"],
  };
  const outcomes: Record<UsageEntry["outcome"], [string, string]> = {
    completed: ["ukończone", "completed"],
    failed: ["nieudane", "failed"],
    cancelled: ["zatrzymane", "stopped"],
  };
  return (
    <section className="usage-ledger" aria-labelledby="usage-title">
      <h2 id="usage-title" className="cc-section">
        {pl ? "Rejestr zużycia · 30 dni" : "Usage ledger · 30 days"}
      </h2>
      <p className="helper">
        {pl
          ? "Każde wywołanie agenta w tej aplikacji. Tokeny tylko z raportu CLI; bez raportu wywołanie liczy się jako nieznane, nigdy jako zero."
          : "Every agent invocation in this app. Tokens only from the CLI's own report; without one an invocation counts as unknown, never zero."}
      </p>
      {!data.summary.length ? (
        <p className="helper">
          {pl
            ? "Brak wywołań w tym okresie."
            : "No invocations in this period."}
        </p>
      ) : (
        <div className="usage-table" role="table">
          <div role="row" className="usage-head">
            <span role="columnheader">{pl ? "Agent" : "Agent"}</span>
            <span role="columnheader">{pl ? "Wywołania" : "Invocations"}</span>
            <span role="columnheader">{pl ? "Zmierzone" : "Measured"}</span>
            <span role="columnheader">{pl ? "Wejście" : "Input"}</span>
            <span role="columnheader">{pl ? "Wyjście" : "Output"}</span>
          </div>
          {data.summary.map((s) => (
            <div role="row" key={s.agent}>
              <span role="cell" className="usage-agent">
                <ProviderIcon provider={s.agent} />
                {agentName(s.agent)}
                {!!s.paid && <small>{pl ? "płatne API" : "paid API"}</small>}
              </span>
              <span role="cell">{n(s.invocations)}</span>
              <span role="cell">
                {s.measured}/{s.invocations}
                {!!s.unmeasured && (
                  <small>
                    {pl
                      ? ` · ${s.unmeasured} bez raportu`
                      : ` · ${s.unmeasured} unreported`}
                  </small>
                )}
              </span>
              <span role="cell">{n(s.inputTokens)}</span>
              <span role="cell">{n(s.outputTokens)}</span>
            </div>
          ))}
        </div>
      )}
      {!!data.recent.length && (
        <details className="usage-recent">
          <summary>
            {pl ? "Ostatnie wywołania" : "Latest invocations"} ·{" "}
            {data.recent.length}
          </summary>
          <ul>
            {data.recent.map((e) => (
              <li key={e.id}>
                <strong>{agentName(e.agent)}</strong>
                <span>{roles[e.role][pl ? 0 : 1]}</span>
                <span>{outcomes[e.outcome][pl ? 0 : 1]}</span>
                <span>
                  {e.source === "unknown"
                    ? pl
                      ? "tokeny nieznane"
                      : "tokens unknown"
                    : `${n(e.inputTokens)} → ${n(e.outputTokens)}`}
                </span>
                <time>
                  {relativeTime(new Date(e.at).toISOString(), language)}
                </time>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
