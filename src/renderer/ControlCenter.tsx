import React from "react";
import type { ConnectorScan, ConnectorStatus } from "../shared";
import { ccWords } from "./cc-i18n";
import { Icon, relativeTime } from "./ui";

const TONES: Record<ConnectorStatus["state"], string> = {
  ready: "tone-success",
  "needs-auth": "tone-warning",
  "needs-install": "tone-muted",
  experimental: "tone-info",
  unsupported: "tone-muted",
  degraded: "tone-danger",
};
const NEXT_STEP_INSTALL = new Set(["ollama", "opencode"]);

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part.slice(0, 1))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function nextSteps(connectors: ConnectorStatus[]) {
  const steps: { id: string; key: string; name: string }[] = [];
  for (const c of connectors) {
    if (c.state === "needs-auth")
      steps.push({ id: c.id, key: "needs-auth", name: c.name });
    else if (c.reason === "auth_unknown")
      steps.push({ id: c.id, key: "auth_unknown", name: c.name });
    else if (c.reason === "server_down")
      steps.push({ id: c.id, key: "server_down", name: c.name });
    else if (c.reason === "probe_failed")
      steps.push({ id: c.id, key: "probe_failed", name: c.name });
    else if (c.reason === "bridge_required")
      steps.push({ id: c.id, key: "bridge_required", name: c.name });
    else if (c.state === "needs-install" && NEXT_STEP_INSTALL.has(c.id))
      steps.push({ id: c.id, key: "needs-install", name: c.name });
  }
  return steps.slice(0, 6);
}

export function ControlCenter({
  language,
  scan,
  scanning,
  failed,
  onRescan,
  onOpenQuota,
}: {
  language: "pl" | "en";
  scan: ConnectorScan | null;
  scanning: boolean;
  failed: boolean;
  onRescan: () => void;
  onOpenQuota?: () => void;
}) {
  const t = ccWords[language];
  const connectors = scan?.connectors ?? [];
  const ready = connectors.filter((c) => c.state === "ready").length;
  const attention = connectors.filter(
    (c) => c.state === "needs-auth" || c.state === "degraded",
  ).length;
  const runsToday = (scan?.usage ?? []).reduce((n, u) => n + u.runsToday, 0);
  const steps = nextSteps(connectors);
  const usageOf = (id: string) => scan?.usage.find((u) => u.provider === id);
  const signIn = (c: ConnectorStatus) => {
    if (c.auth === "authenticated")
      return (
        [c.authMethod, c.plan, c.account && `@${c.account}`]
          .filter(Boolean)
          .join(" · ") || t.signedIn
      );
    if (c.auth === "unauthenticated") return t.notSignedIn;
    return t.unknown;
  };
  return (
    <section className="control-center" aria-labelledby="cc-title">
      <div className="cc-head">
        <div>
          <h1 id="cc-title">{t.title}</h1>
          <p className="cc-subtitle">{t.subtitle}</p>
        </div>
        <div className="cc-actions">
          {scan && (
            <span className="cc-scanned">
              {t.scannedAt}: {relativeTime(scan.observedAt, language)}
            </span>
          )}
          <button
            className="secondary"
            onClick={onRescan}
            disabled={scanning}
            aria-busy={scanning}
          >
            <Icon name="refresh" className={scanning ? "spin" : ""} />
            {scanning ? t.scanning : t.rescan}
          </button>
        </div>
      </div>
      {failed && (
        <div className="error" role="alert">
          <Icon name="info" />
          <span>{t.scanFailed}</span>
        </div>
      )}
      <ul className="cc-stats" aria-label={t.fleet}>
        <li>
          <span className="stat-value">
            {scan ? `${ready}/${connectors.length}` : "–"}
          </span>
          <span className="stat-label">{t.statReady}</span>
        </li>
        <li>
          <span className="stat-value">{scan ? attention : "–"}</span>
          <span className="stat-label">{t.statAttention}</span>
        </li>
        <li>
          <span className="stat-value">{scan ? runsToday : "–"}</span>
          <span className="stat-label">{t.statRuns}</span>
        </li>
        <li
          onClick={onOpenQuota}
          style={{ cursor: onOpenQuota ? "pointer" : "default" }}
          title={language === "pl" ? "Przejdź do panelu OpenQuota" : "Open Quota Dashboard"}
        >
          <span className="stat-value" style={{ color: "var(--accent)" }}>OpenQuota ⚡</span>
          <span className="stat-label">
            {language === "pl" ? "Limity i tokeny live" : "Live token limits"}
          </span>
        </li>
      </ul>
      {steps.length > 0 && (
        <aside className="cc-next" aria-labelledby="cc-next-title">
          <h2 id="cc-next-title">{t.next}</h2>
          <ol>
            {steps.map((step) => (
              <li key={step.id}>
                {t.steps[step.key]!.replace("{name}", step.name)}
              </li>
            ))}
          </ol>
        </aside>
      )}
      <h2 className="cc-section">{t.fleet}</h2>
      {!scan && !failed ? (
        <div className="fleet" aria-busy="true" aria-label={t.scanning}>
          {Array.from({ length: 6 }, (_, index) => (
            <div className="connector-card skeleton-card" key={index} />
          ))}
        </div>
      ) : (
        <div className="fleet">
          {connectors.map((c) => {
            const usage = usageOf(c.id);
            const hasRuns = c.adapter === "available" || c.adapter === "requires-bridge";
            return (
              <article
                className={`connector-card ${TONES[c.state]}`}
                key={c.id}
                data-connector={c.id}
              >
                <header>
                  <span className="connector-avatar" aria-hidden="true">
                    {initials(c.name)}
                  </span>
                  <div className="connector-title">
                    <h3>{c.name}</h3>
                    <span>{t.kinds[c.kind]}</span>
                  </div>
                  <span className={`state-badge ${TONES[c.state]}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {t.states[c.state]}
                  </span>
                </header>
                <p className="connector-reason">{t.reasons[c.reason]}</p>
                {c.installed && (
                  <dl>
                    {c.kind !== "api" && (
                      <div>
                        <dt>{t.version}</dt>
                        <dd>{c.version ?? t.unknown}</dd>
                      </div>
                    )}
                    {c.auth !== "not-applicable" && (
                      <div>
                        <dt>{t.signIn}</dt>
                        <dd>{signIn(c)}</dd>
                      </div>
                    )}
                    <div className="wide">
                      <dt>{t.adapter}</dt>
                      <dd>{t.adapters[c.adapter]}</dd>
                    </div>
                    {c.path && (
                      <div className="wide">
                        <dt>{t.location}</dt>
                        <dd>
                          <code title={c.path}>{c.path}</code>
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
                {c.models.length > 0 && (
                  <div className="model-chips" aria-label={t.models}>
                    {c.models.slice(0, 6).map((m) => (
                      <span key={m}>{m}</span>
                    ))}
                    {c.models.length > 6 && <span>+{c.models.length - 6}</span>}
                  </div>
                )}
                {!c.installed && c.kind !== "api" && (
                  <p className="install-hint">
                    <span>{t.install}</span>
                    <code>{c.installHint}</code>
                  </p>
                )}
                {hasRuns && (
                  <div className="quota-block">
                    <div>
                      <span className="quota-label">{t.providerLimit}</span>
                      <strong>{t.limitUnknown}</strong>
                      <small>{t.limitUnknownNote}</small>
                    </div>
                    <div>
                      <span className="quota-label">{t.localRuns}</span>
                      <strong>{usage?.runsToday ?? 0}</strong>
                      <small>{t.localRunsNote}</small>
                    </div>
                  </div>
                )}
                {c.state === "ready" && c.adapter === "available" && (
                  <p className="smoke-note">
                    <Icon name="info" />
                    {t.smokeNote}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
      <p className="cc-safety">
        <Icon name="shield" />
        {t.safety}
      </p>
    </section>
  );
}
