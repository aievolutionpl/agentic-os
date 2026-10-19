import React, { useEffect, useState } from "react";
import type { ProviderQuotaCard, CustomSubscriptionInput } from "../shared";
import { Icon } from "./ui";

const api = window.agenting;

const BRAND_ICONS: Record<string, React.ReactNode> = {
  claude: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2L14.2 9.8L22 12L14.2 14.2L12 22L9.8 14.2L2 12L9.8 9.8L12 2Z"
        fill="#D97706"
        stroke="#B45309"
        strokeWidth="1.5"
      />
    </svg>
  ),
  codex: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 7V17M7 12H17M8.5 8.5L15.5 15.5M8.5 15.5L15.5 8.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  ),
  antigravity: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3L21 19H3L12 3Z"
        fill="#2563EB"
        stroke="#1D4ED8"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="14" r="2.5" fill="#FFFFFF" />
    </svg>
  ),
  openai: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="#10A37F" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4" fill="#10A37F" />
    </svg>
  ),
  openrouter: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" stroke="#6366F1" strokeWidth="1.5" />
      <path d="M9 12L12 15L15 9" stroke="#6366F1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  custom: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M12 8V12L15 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

export function OpenQuotaPanel({ language = "en" }: { language?: "pl" | "en" }) {
  const [cards, setCards] = useState<ProviderQuotaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formProvider, setFormProvider] = useState("claude");
  const [formPlan, setFormPlan] = useState("Pro");
  const [formLimit, setFormLimit] = useState("1000000");
  const [formUsed, setFormUsed] = useState("150000");
  const [formPeriod, setFormPeriod] = useState<"session" | "daily" | "weekly" | "monthly">("weekly");

  const isPl = language === "pl";

  const fetchQuotas = async (isManual = false) => {
    if (!api?.quotaScan) return;
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = isManual && api.quotaRefresh ? await api.quotaRefresh() : await api.quotaScan();
      setCards(data);
    } catch (e: any) {
      setError(e?.message || (isPl ? "Nie udało się pobrać limitów" : "Failed to load quota limits"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchQuotas();
    const interval = setInterval(() => {
      void fetchQuotas();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!api?.quotaSaveCustom) return;
    try {
      setRefreshing(true);
      const sub: CustomSubscriptionInput = {
        name: formName.trim() || "Custom Quota",
        provider: formProvider,
        plan: formPlan.trim() || "Custom",
        tokenLimit: Number(formLimit) || 1000000,
        tokensUsed: Number(formUsed) || 0,
        period: formPeriod,
      };
      await api.quotaSaveCustom(sub);
      setModalOpen(false);
      // Reset form
      setFormName("");
      setFormLimit("1000000");
      setFormUsed("0");
      await fetchQuotas(true);
    } catch (err: any) {
      setError(err?.message || "Failed to save subscription");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!api?.quotaDeleteCustom) return;
    try {
      setRefreshing(true);
      await api.quotaDeleteCustom(id);
      await fetchQuotas(true);
    } catch (err: any) {
      setError(err?.message || "Failed to delete subscription");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="openquota-container">
      {/* Top Header */}
      <header className="openquota-header">
        <div className="openquota-titles">
          <div className="openquota-brand-badge">
            <span className="openquota-pulse-dot" />
            <span>OpenQuota Live</span>
          </div>
          <h1>{isPl ? "Limity i tokeny subskrypcji" : "Subscription Quota & Limits"}</h1>
          <p className="openquota-subtitle">
            {isPl
              ? "Bieżąca kontrola limitów sesyjnych, tygodniowych i puli tokenów w modelach AI."
              : "Live session, weekly allowances and token monitoring across your AI subscriptions."}
          </p>
        </div>
        <div className="openquota-actions">
          <button
            className="secondary openquota-refresh-btn"
            onClick={() => void fetchQuotas(true)}
            disabled={refreshing || loading}
            title={isPl ? "Odśwież limity" : "Refresh quotas"}
          >
            <Icon name="refresh" className={refreshing ? "spin" : ""} />
            <span>{refreshing ? (isPl ? "Odświeżanie…" : "Refreshing…") : (isPl ? "Odśwież" : "Refresh")}</span>
          </button>
          <button
            className="primary openquota-add-btn"
            onClick={() => setModalOpen(true)}
            title={isPl ? "Dodaj własną subskrypcję" : "Add custom subscription"}
          >
            <Icon name="plus" />
            <span>{isPl ? "Dodaj subskrypcję" : "Add Subscription"}</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="error" role="alert" style={{ margin: "16px 0" }}>
          <Icon name="info" />
          <span>{error}</span>
        </div>
      )}

      {/* Cards Grid */}
      {loading && cards.length === 0 ? (
        <div className="openquota-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="openquota-card skeleton-card" style={{ height: "260px" }} />
          ))}
        </div>
      ) : (
        <div className="openquota-grid">
          {cards.map((card) => {
            const brandIcon = BRAND_ICONS[card.icon] || BRAND_ICONS.custom;
            return (
              <div key={card.id} className={`openquota-card status-${card.status}`}>
                {/* Card Header */}
                <div className="openquota-card-header">
                  <div className="openquota-card-identity">
                    <span className="openquota-drag-handle" aria-hidden="true" title="Drag to reorder">
                      ⠿
                    </span>
                    <h2 className="openquota-provider-name">{card.name}</h2>
                    <span className="openquota-plan-tag">{card.plan}</span>
                  </div>
                  <div className="openquota-card-brand">
                    {brandIcon}
                    {card.isCustom && (
                      <button
                        className="openquota-delete-btn"
                        onClick={() => void handleDelete(card.id)}
                        title={isPl ? "Usuń" : "Delete"}
                        aria-label="Delete"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* Account info if present */}
                {card.account && (
                  <div className="openquota-card-account">
                    <code>{card.account}</code>
                  </div>
                )}

                {/* Metrics list */}
                <div className="openquota-metrics">
                  {card.metrics.map((metric) => {
                    const hasBurn = Boolean(metric.burnNotice);
                    const isExhausted = metric.remainingPercent <= 0;
                    const isWarning = metric.remainingPercent <= 25 || hasBurn;
                    const fillClass = isExhausted
                      ? "fill-exhausted"
                      : isWarning
                        ? "fill-warning"
                        : "fill-healthy";

                    return (
                      <div key={metric.id} className="openquota-metric-row">
                        {/* Top metric row: label and burn warning */}
                        <div className="openquota-metric-top">
                          <span className="openquota-metric-label">{metric.label}</span>
                          {metric.burnNotice && (
                            <span className="openquota-burn-badge">{metric.burnNotice}</span>
                          )}
                        </div>

                        {/* Progress bar track & fill */}
                        <div className="openquota-bar-track">
                          <div
                            className={`openquota-bar-fill ${fillClass}`}
                            style={{
                              width: `${Math.max(0, Math.min(100, metric.remainingPercent))}%`,
                            }}
                          />
                        </div>

                        {/* Bottom metric row: % left and reset text */}
                        <div className="openquota-metric-bottom">
                          <span className="openquota-left-text">
                            {metric.format === "tokens" && metric.usedValue !== null && metric.limitValue !== null
                              ? `${metric.remainingPercent}% left (${((metric.limitValue - metric.usedValue) / 1000).toFixed(0)}k tk)`
                              : metric.format === "usd" && metric.usedValue !== null
                                ? `$${metric.usedValue.toFixed(2)} spent`
                                : `${metric.remainingPercent}% left`}
                          </span>
                          <span className="openquota-reset-text">
                            {metric.resetNotice || "Reset unavailable"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Usage Trend Sparkline */}
                {card.usageTrend && card.usageTrend.length > 0 && (
                  <div className="openquota-trend-section">
                    <span className="openquota-trend-label">
                      {isPl ? "Trend użycia" : "Usage Trend"}
                    </span>
                    <div className="openquota-sparkline">
                      {card.usageTrend.map((val, idx) => (
                        <div
                          key={idx}
                          className="openquota-spark-bar"
                          style={{
                            height: `${Math.max(12, Math.min(100, val))}%`,
                            opacity: val > 50 ? 1 : 0.45,
                          }}
                          title={`Period ${idx + 1}: ${val}%`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal to add custom subscription */}
      {modalOpen && (
        <div className="openquota-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="openquota-modal" onClick={(e) => e.stopPropagation()}>
            <div className="openquota-modal-head">
              <h2>{isPl ? "Dodaj subskrypcję do monitorowania" : "Add Subscription to Monitor"}</h2>
              <button
                className="icon-button"
                onClick={() => setModalOpen(false)}
                title={isPl ? "Zamknij" : "Close"}
              >
                <Icon name="close" />
              </button>
            </div>
            <form onSubmit={handleSaveCustom} className="openquota-form">
              <div className="form-field">
                <label>{isPl ? "Nazwa subskrypcji / konta" : "Subscription / Account Name"}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Work Claude, OpenAI Team, OpenRouter"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>{isPl ? "Dostawca / Typ" : "Provider / Icon"}</label>
                  <select value={formProvider} onChange={(e) => setFormProvider(e.target.value)}>
                    <option value="claude">Claude</option>
                    <option value="codex">Codex / ChatGPT</option>
                    <option value="antigravity">Antigravity</option>
                    <option value="openai">OpenAI Direct</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="custom">Other / Custom</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>{isPl ? "Plan / Pakiet" : "Plan / Tier"}</label>
                  <input
                    type="text"
                    placeholder="e.g. Pro, Team, PayG"
                    value={formPlan}
                    onChange={(e) => setFormPlan(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>{isPl ? "Limit tokenów" : "Token Limit"}</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="1000000"
                    value={formLimit}
                    onChange={(e) => setFormLimit(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>{isPl ? "Zużyte tokeny" : "Tokens Used"}</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formUsed}
                    onChange={(e) => setFormUsed(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-field">
                <label>{isPl ? "Okres odnawiania limitu" : "Reset Cycle"}</label>
                <select
                  value={formPeriod}
                  onChange={(e) => setFormPeriod(e.target.value as any)}
                >
                  <option value="session">{isPl ? "Sesja (5 godzin)" : "Session (5 hours)"}</option>
                  <option value="daily">{isPl ? "Dzienny (24h)" : "Daily (24h)"}</option>
                  <option value="weekly">{isPl ? "Tygodniowy (7 dni)" : "Weekly (7 days)"}</option>
                  <option value="monthly">{isPl ? "Miesięczny (30 dni)" : "Monthly (30 days)"}</option>
                </select>
              </div>

              <div className="openquota-modal-actions">
                <button type="button" className="secondary" onClick={() => setModalOpen(false)}>
                  {isPl ? "Anuluj" : "Cancel"}
                </button>
                <button type="submit" className="primary">
                  {isPl ? "Zapisz i monitoruj" : "Save & Monitor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
