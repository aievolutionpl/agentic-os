import React, { useEffect, useRef, useState } from "react";
import type {
  ProviderQuotaCard,
  CustomSubscriptionInput,
  QuotaMetric,
  ProviderSetting,
  LimitBridgeStatus,
} from "../shared";
import { LimitLink } from "./LimitLink";
import { Icon, Modal } from "./ui";
import { ProviderIcon } from "./ProviderIcon";

const details: Record<string, [string, string]> = {
  GEMINI_USE_OFFICIAL_USAGE: [
    "Sprawdź limity w swoim koncie Google. Adapter nie udostępnia zweryfikowanego licznika subskrypcji.",
    "Check your Google account limits. This adapter has no verified subscription counter.",
  ],
  PROVIDER_USAGE_UNAVAILABLE: [
    "Limity zależą od wybranego dostawcy. To połączenie nie udostępnia zweryfikowanego odczytu budżetu; możesz dodać budżet ręczny.",
    "Limits depend on the selected provider. This connection has no verified budget reader; you can add a manual budget.",
  ],
  LOCAL_MODEL_NO_SUBSCRIPTION_QUOTA: [
    "Dla lokalnej inferencji nie ma limitu subskrypcji do odczytania. Wydajność zależy od modelu i urządzenia.",
    "Local inference has no subscription quota to read. Performance depends on the model and device.",
  ],
  CONFIGURE_CODEX: [
    "Podłącz Codex w Połączeniach. Odczyt użyje wybranego profilu CLI.",
    "Connect Codex in Connections. Reads use the selected CLI profile.",
  ],
  CODEX_LIMITS_UNAVAILABLE: [
    "CLI nie zwróciło limitów. Sprawdź logowanie i wersję Codexa.",
    "The CLI did not return limits. Check sign-in and Codex version.",
  ],
  CLAUDE_USE_OFFICIAL_USAGE: [
    "Połącz pasek statusu Claude Code, aby widzieć okna 5 h i 7 dni swojej subskrypcji. Bez tego: /usage w Claude Code.",
    "Link Claude Code's status line to see your subscription's 5-hour and 7-day windows. Without it: /usage in Claude Code.",
  ],
  ANTIGRAVITY_USE_OFFICIAL_USAGE: [
    "Połącz pasek statusu Antigravity CLI, aby widzieć, ile zostało w pulach limitów. Bez tego: /usage w Antigravity.",
    "Link Antigravity CLI's status line to see what is left in your quota pools. Without it: /usage in Antigravity.",
  ],
  CLAUDE_LIMITS_FROM_RUNS: [
    "Okna limitów i tokeny zgłoszone przez Claude Code podczas Twoich zadań w Agenting OS (zdarzenie rate_limit_event). Odświeżają się przy kolejnym użyciu Claude. Procent pojawia się tylko, gdy CLI go podaje.",
    "Limit windows and tokens reported by Claude Code during your Agenting OS runs (rate_limit_event). They refresh the next time Claude is used. A percentage appears only when the CLI includes it.",
  ],
  CLAUDE_TOKENS_FROM_RUNS: [
    "Tokeny zgłoszone przez Claude Code w Twoich zadaniach w Agenting OS. Okno limitu pojawi się, gdy CLI je zgłosi. Pełne limity: /usage w Claude Code.",
    "Tokens reported by Claude Code in your Agenting OS runs. A limit window appears once the CLI reports one. Full limits: /usage in Claude Code.",
  ],
  ANTIGRAVITY_TOKENS_FROM_RUNS: [
    "Tokeny zgłoszone przez Antigravity CLI w Twoich zadaniach w Agenting OS. Limity modeli: /usage w Antigravity.",
    "Tokens reported by Antigravity CLI in your Agenting OS runs. Model quotas: /usage in Antigravity.",
  ],
  CONFIGURE_OPENROUTER: [
    "Dodaj klucz API w Połączeniach, aby odczytać jego rzeczywisty budżet.",
    "Add an API key in Connections to read its actual budget.",
  ],
  OPENROUTER_UNAVAILABLE: [
    "Nie udało się odczytać API. Sprawdź klucz i połączenie, a potem odśwież.",
    "API read failed. Check the key and connection, then refresh.",
  ],
  CLAUDE_LIMITS_FROM_STATUS_LINE: [
    "Okna 5 h i 7 dni Twojej subskrypcji, przekazane przez pasek statusu Claude Code przy ostatnim użyciu (także poza Agenting OS). Procent obejmuje całe konto.",
    "Your subscription's 5-hour and 7-day windows, handed over by Claude Code's status line the last time you used it (also outside Agenting OS). The percentage covers the whole account.",
  ],
  ANTIGRAVITY_LIMITS_FROM_STATUS_LINE: [
    "Wspólne pule limitów Antigravity przekazane przez pasek statusu CLI przy ostatnim użyciu. Pokazujemy, ile procent zostało.",
    "Antigravity's shared quota pools, handed over by the CLI status line the last time you used it. Shown as the share left.",
  ],
  OPENROUTER_ACCOUNT_BALANCE: [
    "Saldo konta OpenRouter (zakupione kredyty minus zużycie) oraz wydatki klucza dziś, w tym tygodniu i miesiącu. Kwoty w USD.",
    "OpenRouter account balance (credits bought minus usage) plus the key's spend today, this week and this month. Amounts in USD.",
  ],
  BILLED_VIA_OPENROUTER: [
    "Wywołania modeli tego agenta są rozliczane z połączonego konta OpenRouter, więc widzisz jego saldo.",
    "This agent's model calls are billed to the connected OpenRouter account, so you see its balance.",
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
  const [providers, setProviders] = useState<ProviderSetting[]>([]);
  const [links, setLinks] = useState<LimitBridgeStatus[]>([]);
  const [form, setForm] = useState<CustomSubscriptionInput | null>(null),
    [deleting, setDeleting] = useState<ProviderQuotaCard | null>(null);
  const mounted = useRef(true),
    inFlight = useRef(false);
  async function load(force = false) {
    if (inFlight.current || !api?.quotaScan) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      const [data, connections] = await Promise.all([
        force && api.quotaRefresh ? api.quotaRefresh() : api.quotaScan(),
        api.providerSettings(),
      ]);
      const bridges = api.limitBridgeStatus
        ? await api.limitBridgeStatus().catch(() => [])
        : [];
      if (mounted.current) {
        setCards(data.filter((c) => c.id !== "gemini"));
        setProviders(connections);
        setLinks(bridges);
      }
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
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 60000);
    const focus = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, []);
  const num = (n: number) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(n);
  const display = (m: QuotaMetric, n: number | null) =>
    n === null
      ? "—"
      : `${num(n)}${m.format === "usd" ? " USD" : m.format === "percent" ? "%" : ""}`;
  // Cards with nothing to show collapse into one line each below the grid.
  const idle = (card: ProviderQuotaCard) =>
    card.source === "unavailable" &&
    !card.isCustom &&
    !providers.some((p) => p.id === card.id && p.configured);
  const link = (card: ProviderQuotaCard) => {
    const status = links.find((l) => l.agent === card.id);
    return status ? (
      <LimitLink
        status={status}
        pl={pl}
        onChanged={(next) => {
          setLinks((all) =>
            all.map((l) => (l.agent === next.agent ? next : l)),
          );
          void load(true);
        }}
      />
    ) : null;
  };
  const source = (card: ProviderQuotaCard) =>
    card.source === "manual"
      ? pl
        ? "Wpis ręczny"
        : "Manual entry"
      : card.source === "unavailable"
        ? pl
          ? "Brak odczytu"
          : "No reading"
        : card.source === "cli-stream"
          ? pl
            ? "Zgłoszone przez CLI"
            : "Reported by the CLI"
          : card.source === "cli-statusline"
            ? pl
              ? "Pasek statusu CLI"
              : "CLI status line"
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
              ? "Automatyczna synchronizacja co minutę. Limity subskrypcji, budżety API i tokeny ze wskazanym źródłem."
              : "Automatic sync every minute. Subscription limits, API budgets and tokens with their source."}
          </p>
        </div>
        <div className="panel-actions">
          <button
            className="secondary"
            onClick={() => void load(true)}
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
        {cards
          .filter((card) => !idle(card))
          .map((card) => (
            <article
              className={`budget-card status-${card.status}`}
              key={card.id}
              data-quota={card.id}
            >
              <header>
                <ProviderIcon provider={card.icon} />
                <div>
                  <h2>{card.name}</h2>
                  {providers.some((p) => p.id === card.id && p.configured) && (
                    <small className="connection-state connected">
                      {pl ? "Połączenie zapisane" : "Connection saved"}
                    </small>
                  )}
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
                        (v, i) =>
                          `${card.trendLabels?.[i] ?? i + 1}: ${num(v)}`,
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
              {link(card)}
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
      {cards.some(idle) && (
        <section className="quota-idle" aria-labelledby="quota-idle-title">
          <h2 id="quota-idle-title" className="cc-section">
            {pl ? "Bez odczytu limitów" : "No limit reading"}
          </h2>
          <ul>
            {cards.filter(idle).map((card) => (
              <li key={card.id} data-quota={card.id}>
                <ProviderIcon provider={card.icon} />
                <strong>{card.name}</strong>
                <span>
                  {(card.detail && details[card.detail]?.[pl ? 0 : 1]) ??
                    (pl
                      ? "Dane dostawcy są niedostępne."
                      : "Provider data is unavailable.")}
                </span>
                <div className="quota-idle-actions">
                  {link(card)}
                  <button className="text-action" onClick={onConfigure}>
                    {pl ? "Połączenia" : "Connections"}
                    <Icon name="chevron" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
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
