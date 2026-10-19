import React, { useEffect, useRef, useState } from "react";
import type {
  ProviderQuotaCard,
  CustomSubscriptionInput,
  QuotaMetric,
} from "../shared";
import { Icon, Modal } from "./ui";
import { ProviderIcon } from "./ProviderIcon";

const details: Record<string, [string, string]> = {
  CONFIGURE_CODEX: [
    "Podłącz Codex w Połączeniach. Odczyt użyje wybranego profilu CLI.",
    "Connect Codex in Connections. Reads use the selected CLI profile.",
  ],
  CODEX_LIMITS_UNAVAILABLE: [
    "CLI nie zwróciło limitów. Sprawdź logowanie i wersję Codexa.",
    "The CLI did not return limits. Check sign-in and Codex version.",
  ],
  CLAUDE_USE_OFFICIAL_USAGE: [
    "Sprawdź /usage w Claude Code. Automatyczny odczyt jest niedostępny. Możesz dodać ręczny budżet.",
    "Check /usage in Claude Code. Automatic reading is unavailable. You can add a manual budget.",
  ],
  ANTIGRAVITY_USE_OFFICIAL_USAGE: [
    "Sprawdź /usage w Antigravity. Brak zweryfikowanego odczytu limitów w tym adapterze.",
    "Check /usage in Antigravity. This adapter has no verified quota reader.",
  ],
  CONFIGURE_OPENROUTER: [
    "Dodaj klucz API w Połączeniach, aby odczytać jego rzeczywisty budżet.",
    "Add an API key in Connections to read its actual budget.",
  ],
  OPENROUTER_UNAVAILABLE: [
    "Nie udało się odczytać API. Sprawdź klucz i połączenie, a potem odśwież.",
    "API read failed. Check the key and connection, then refresh.",
  ],
  API_KEY_BUDGET_NOT_ACCOUNT_BALANCE: [
    "Budżet klucza API; nie jest saldem całego konta. Koszty w USD, nie w tokenach.",
    "API key budget, not the entire account balance. Costs are in USD, not tokens.",
  ],
};
const fresh = (): CustomSubscriptionInput => ({
  name: "",
  provider: "custom",
  plan: "Manual",
  tokenLimit: 1000000,
  tokensUsed: 0,
  period: "monthly",
  resetAt: null,
});
function Gauge({ metric, pl }: { metric?: QuotaMetric; pl: boolean }) {
  const known =
    metric?.usedValue !== null && metric?.limitValue !== null && !!metric;
  const value = known ? Math.round(metric.remainingPercent) : null;
  return (
    <div className={`budget-gauge ${known ? "" : "unknown"}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="gauge-track" cx="60" cy="60" r="49" />
        <circle
          className="gauge-fill"
          cx="60"
          cy="60"
          r="49"
          strokeDasharray={`${(value ?? 0) * 3.079} 308`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div>
        <strong>{value === null ? "—" : `${value}%`}</strong>
        <span>
          {value === null
            ? pl
              ? "brak danych"
              : "no data"
            : pl
              ? "pozostało"
              : "remaining"}
        </span>
      </div>
    </div>
  );
}
export function OpenQuotaPanel({
  language = "en",
  onConfigure,
}: {
  language?: "pl" | "en";
  onConfigure?: () => void;
}) {
  const pl = language === "pl",
    api = window.agenting;
  const [cards, setCards] = useState<ProviderQuotaCard[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const [form, setForm] = useState<CustomSubscriptionInput | null>(null),
    [deleting, setDeleting] = useState<ProviderQuotaCard | null>(null);
  const mounted = useRef(true),
    inFlight = useRef(false);
  async function load() {
    if (inFlight.current || !api?.quotaScan) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      const data = await api.quotaScan();
      if (mounted.current) setCards(data);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, []);
  const num = (n: number) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(n);
  const display = (m: QuotaMetric, n: number | null) =>
    n === null
      ? "—"
      : `${num(n)}${m.format === "usd" ? " USD" : m.format === "percent" ? "%" : ""}`;
  const source = (card: ProviderQuotaCard) =>
    card.source === "manual"
      ? pl
        ? "Wpis ręczny"
        : "Manual entry"
      : card.source === "unavailable"
        ? pl
          ? "Brak odczytu"
          : "No reading"
        : pl
          ? "Odczyt dostawcy"
          : "Provider reading";
  return (
    <section className="quota-workspace" aria-labelledby="quota-title">
      <header className="quota-page-head">
        <div>
          <span className="section-eyebrow">WORKSPACE / OPENQUOTA</span>
          <h1 id="quota-title">
            {pl ? "Energia Twoich agentów." : "Power behind your agents."}
          </h1>
          <p>
            {pl
              ? "Limity subskrypcji, budżety API i tokeny. Każda liczba ze swoim źródłem."
              : "Subscription limits, API budgets and tokens. Every number has a source."}
          </p>
        </div>
        <div className="panel-actions">
          <button
            className="secondary"
            onClick={() => void load()}
            disabled={busy}
          >
            <Icon name="refresh" className={busy ? "spin" : ""} />
            {pl ? "Odśwież" : "Refresh"}
          </button>
          <button
            className="primary"
            onClick={() => setForm(fresh())}
            disabled={busy}
          >
            <Icon name="plus" />
            {pl ? "Dodaj budżet" : "Add budget"}
          </button>
        </div>
      </header>
      <div className="quota-summary">
        <div>
          <span>{pl ? "ODCZYTY DOSTAWCÓW" : "PROVIDER READINGS"}</span>
          <strong>
            {
              cards.filter(
                (c) => c.source !== "manual" && c.source !== "unavailable",
              ).length
            }
            <small> / {cards.filter((c) => !c.isCustom).length}</small>
          </strong>
        </div>
        <div>
          <span>{pl ? "BUDŻETY RĘCZNE" : "MANUAL BUDGETS"}</span>
          <strong>{cards.filter((c) => c.isCustom).length}</strong>
        </div>
        <p>
          <Icon name="shield" />
          {pl
            ? "Procent limitu subskrypcji nie oznacza liczby tokenów. Brak danych nigdy nie oznacza 100% dostępności."
            : "Subscription percentages are not token counts. Missing data never means 100% available."}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {pl
            ? "Nie udało się odczytać danych. Spróbuj ponownie."
            : "Could not read data. Please try again."}
        </p>
      )}
      {busy && !cards.length && (
        <p role="status">
          {pl ? "Sprawdzam źródła limitów…" : "Reading quota sources…"}
        </p>
      )}
      <div className="budget-grid">
        {cards.map((card) => (
          <article
            className={`budget-card status-${card.status}`}
            key={card.id}
            data-quota={card.id}
          >
            <header>
              <ProviderIcon provider={card.icon} />
              <div>
                <h2>{card.name}</h2>
                <span>{card.plan}</span>
              </div>
              <span className={`source-chip source-${card.source}`}>
                {source(card)}
              </span>
            </header>
            <div className="budget-main">
              <Gauge metric={card.metrics[0]} pl={pl} />
              <div className="budget-reading">
                <span>
                  {card.metrics[0]?.label ??
                    (pl ? "LIMIT SUBSKRYPCJI" : "SUBSCRIPTION LIMIT")}
                </span>
                <strong>
                  {card.metrics[0]
                    ? display(
                        card.metrics[0],
                        card.metrics[0].limitValue === null
                          ? card.metrics[0].usedValue
                          : Math.max(
                              0,
                              card.metrics[0].limitValue -
                                card.metrics[0].usedValue!,
                            ),
                      )
                    : "—"}
                </strong>
                <small>
                  {card.metrics[0]?.limitValue === null
                    ? pl
                      ? "zarejestrowane zużycie · limit nieznany"
                      : "recorded usage · unknown limit"
                    : card.metrics[0]
                      ? `${pl ? "z" : "of"} ${display(card.metrics[0], card.metrics[0].limitValue)} ${pl ? "pozostało" : "remaining"}`
                      : pl
                        ? "oczekuje na dane"
                        : "awaiting data"}
                </small>
              </div>
            </div>
            {card.metrics.length > 0 && (
              <div className="budget-metrics">
                {card.metrics.map((m) => (
                  <div key={m.id} className="budget-metric">
                    <div>
                      <span>{m.label}</span>
                      <strong>
                        {display(m, m.usedValue)} / {display(m, m.limitValue)}
                      </strong>
                    </div>
                    {m.limitValue !== null && (
                      <progress
                        max={100}
                        value={m.usedPercent}
                        aria-label={`${card.name} ${m.label} ${pl ? "zużycie" : "usage"}`}
                      />
                    )}
                    <small>
                      {m.resetsAt
                        ? `${pl ? "Reset" : "Resets"}: ${new Date(m.resetsAt).toLocaleString(language)}`
                        : pl
                          ? "Termin resetu nieznany"
                          : "Reset time unknown"}
                    </small>
                  </div>
                ))}
              </div>
            )}
            {card.usageTrend.length > 1 && (
              <figure className="usage-chart">
                <figcaption>
                  {pl
                    ? "Tokeny według dnia · dane dostawcy"
                    : "Daily tokens · provider data"}
                </figcaption>
                <div>
                  {card.usageTrend.map((value, i) => (
                    <span
                      key={i}
                      style={{
                        height: `${Math.max(3, (value / Math.max(1, ...card.usageTrend)) * 66)}px`,
                      }}
                      title={`${card.trendLabels?.[i] ?? i + 1}: ${num(value)}`}
                    />
                  ))}
                </div>
                <p className="sr-only">
                  {card.usageTrend
                    .map(
                      (v, i) => `${card.trendLabels?.[i] ?? i + 1}: ${num(v)}`,
                    )
                    .join("; ")}
                </p>
              </figure>
            )}
            {card.detail && (
              <p className="quota-detail">
                {details[card.detail]?.[pl ? 0 : 1] ??
                  (pl
                    ? "Dane dostawcy są niedostępne."
                    : "Provider data is unavailable.")}
              </p>
            )}
            {card.isCustom && (
              <p className="quota-detail">
                {pl
                  ? "Aktualizowane ręcznie. Upływ terminu resetu nie zeruje tego wpisu."
                  : "Updated manually. Passing a reset date does not reset this entry."}
              </p>
            )}
            <footer>
              <time dateTime={card.updatedAt}>
                {new Date(card.updatedAt).toLocaleTimeString(language, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              {card.isCustom ? (
                <div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      setForm({
                        id: card.id,
                        name: card.name,
                        provider: card.icon,
                        plan: card.plan,
                        tokensUsed: card.metrics[0].usedValue!,
                        tokenLimit: card.metrics[0].limitValue!,
                        period: card.metrics[0]
                          .label as CustomSubscriptionInput["period"],
                        resetAt: card.metrics[0].resetsAt,
                      })
                    }
                  >
                    {pl ? "Edytuj" : "Edit"}
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setDeleting(card)}
                  >
                    {pl ? "Usuń" : "Remove"}
                  </button>
                </div>
              ) : (
                <button className="text-action" onClick={onConfigure}>
                  {pl ? "Połączenia" : "Connections"}
                  <Icon name="chevron" />
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>
      <Modal
        open={!!form}
        onClose={() => {
          if (!busy) setForm(null);
        }}
        titleId="budget-form-title"
        className="budget-dialog"
      >
        <h2 id="budget-form-title">
          {pl ? "Ręczny budżet tokenów" : "Manual token budget"}
        </h2>
        <p className="helper">
          {pl
            ? "Wpis organizacyjny. Nie łączy się z dostawcą ani nie potwierdza limitu subskrypcji."
            : "A planning entry. It neither connects to a provider nor confirms a subscription allowance."}
        </p>
        {form && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError(false);
              void api
                ?.quotaSaveCustom?.(form)
                .then((card) => {
                  setCards((old) => [
                    ...old.filter((c) => c.id !== card.id),
                    card,
                  ]);
                  setForm(null);
                })
                .catch(() => setError(true))
                .finally(() => setBusy(false));
            }}
          >
            <label>
              {pl ? "Nazwa budżetu" : "Budget name"}
              <input
                autoFocus
                required
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              {pl ? "Dostawca" : "Provider"}
              <select
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
              >
                {["custom", "claude", "codex", "antigravity", "openrouter"].map(
                  (id) => (
                    <option key={id}>{id}</option>
                  ),
                )}
              </select>
            </label>
            <div className="budget-form-row">
              <label>
                {pl ? "Limit tokenów" : "Token limit"}
                <input
                  type="number"
                  min={1}
                  max={Number.MAX_SAFE_INTEGER}
                  step={1}
                  required
                  value={form.tokenLimit}
                  onChange={(e) =>
                    setForm({ ...form, tokenLimit: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                {pl ? "Zużyte tokeny" : "Tokens used"}
                <input
                  type="number"
                  min={0}
                  max={Number.MAX_SAFE_INTEGER}
                  step={1}
                  required
                  value={form.tokensUsed}
                  onChange={(e) =>
                    setForm({ ...form, tokensUsed: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label>
              {pl ? "Okres" : "Period"}
              <select
                value={form.period}
                onChange={(e) =>
                  setForm({
                    ...form,
                    period: e.target.value as CustomSubscriptionInput["period"],
                  })
                }
              >
                {[
                  ["session", pl ? "Sesja" : "Session"],
                  ["daily", pl ? "Dzień" : "Day"],
                  ["weekly", pl ? "Tydzień" : "Week"],
                  ["monthly", pl ? "Miesiąc" : "Month"],
                ].map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {pl
                ? "Data resetu (opcjonalnie, UTC)"
                : "Reset date (optional, UTC)"}
              <input
                type="datetime-local"
                value={form.resetAt?.slice(0, 16) ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    resetAt: e.target.value
                      ? new Date(e.target.value + "Z").toISOString()
                      : null,
                  })
                }
              />
            </label>
            {error && (
              <p role="alert">
                {pl
                  ? "Nie udało się zapisać budżetu."
                  : "Could not save budget."}
              </p>
            )}
            <div className="panel-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setForm(null)}
                disabled={busy}
              >
                {pl ? "Anuluj" : "Cancel"}
              </button>
              <button className="primary" disabled={busy}>
                {pl ? "Zapisz budżet" : "Save budget"}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!deleting}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        titleId="budget-delete-title"
      >
        <h2 id="budget-delete-title">
          {pl ? "Usunąć budżet?" : "Remove budget?"}
        </h2>
        <p>{deleting?.name}</p>
        <div className="panel-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setDeleting(null)}
          >
            {pl ? "Anuluj" : "Cancel"}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              if (!deleting) return;
              setBusy(true);
              void api
                ?.quotaDeleteCustom?.(deleting.id)
                .then(() => {
                  setCards((old) => old.filter((c) => c.id !== deleting.id));
                  setDeleting(null);
                })
                .catch(() => setError(true))
                .finally(() => setBusy(false));
            }}
          >
            {pl ? "Usuń budżet" : "Remove budget"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
