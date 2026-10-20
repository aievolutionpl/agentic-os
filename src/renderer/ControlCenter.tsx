import React from "react";
import type {
  Attention,
  AttentionItem,
  ConnectorScan,
  ConnectorStatus,
} from "../shared";
import { attentionWords } from "./Inbox";
import { ccWords } from "./cc-i18n";
import { Icon, relativeTime } from "./ui";
import { ProviderIcon } from "./ProviderIcon";
import { CapabilityMatrix } from "./CapabilityMatrix";
import { DataPanel } from "./DataPanel";

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
    if (c.reason === "connection_required")
      steps.push({ id: c.id, key: "connection_required", name: c.name });
    else if (c.id === "openrouter" && c.state === "needs-auth")
      steps.push({ id: c.id, key: "configure_api", name: c.name });
    else if (c.state === "needs-auth")
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
  onConfigure,
  onNewProject,
  projectCount = 0,
  work = null,
  onOpenInbox,
  onOpenAttention,
}: {
  language: "pl" | "en";
  scan: ConnectorScan | null;
  scanning: boolean;
  failed: boolean;
  onRescan: () => void;
  onOpenQuota?: () => void;
  onConfigure?: () => void;
  onNewProject?: () => void;
  projectCount?: number;
  work?: Attention | null;
  onOpenInbox?: () => void;
  onOpenAttention?: (item: AttentionItem) => void;
}) {
  const t = ccWords[language];
  const connectors = scan?.connectors ?? [];
  const runnable = connectors.filter((c) => c.adapter === "available");
  const ready = runnable.filter((c) => c.state === "ready").length;
  const attention = connectors.filter(
    (c) => c.state === "needs-auth" || c.state === "degraded",
  ).length;
  const runsToday = (scan?.usage ?? []).reduce((n, u) => n + u.runsToday, 0);
  const steps = nextSteps(connectors);
  // Same vocabulary as the Connections cards; the scan already carries checks.
  const mapState = (id: string) => {
    const c = connectors.find((x) => x.id === id);
    if (!c) return "none";
    if (c.state === "ready") return "connected";
    if (c.state === "needs-auth") return "needs-auth";
    if (c.state === "degraded") return "unavailable";
    return c.installed ? "detected" : "none";
  };
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
      <div className="workspace-hero">
        <div className="hero-copy">
          <span className="section-eyebrow">
            <span className="live-point" />
            {language === "pl"
              ? "TWÓJ LOKALNY WORKSPACE"
              : "YOUR LOCAL WORKSPACE"}
          </span>
          <h2>
            {language === "pl" ? (
              <>
                Wiele umysłów.
                <br />
                <em>Jeden kierunek.</em>
              </>
            ) : (
              <>
                Many minds.
                <br />
                <em>One direction.</em>
              </>
            )}
          </h2>
          <p>
            {language === "pl"
              ? "Połącz swoich agentów, daj im wspólny kontekst i zachowaj kontrolę nad każdym rezultatem."
              : "Connect your agents, give them shared context and stay in control of every result."}
          </p>
          <div className="hero-buttons">
            <button className="primary" onClick={onConfigure}>
              <Icon name="connections" />
              {language === "pl" ? "Podłącz agenta" : "Connect an agent"}
            </button>
            <button className="secondary" onClick={onNewProject}>
              <Icon name="plus" />
              {language === "pl" ? "Nowy projekt" : "New project"}
            </button>
          </div>
          <div className="hero-meta">
            <span>
              <Icon name="folder" />
              {projectCount}{" "}
              {language === "pl" ? "projektów lokalnych" : "local projects"}
            </span>
            <span>
              <Icon name="shield" />
              {language === "pl"
                ? "Ty zatwierdzasz zmiany"
                : "You approve changes"}
            </span>
          </div>
        </div>
        <div
          className="agent-map"
          role="img"
          aria-label={
            language === "pl"
              ? "Schemat: lokalny workspace łączy Codex, Claude, OpenCode i Antigravity ze wspólną pamięcią. Stan połączeń poniżej."
              : "Diagram: a local workspace connects Codex, Claude, OpenCode and Antigravity to shared memory. Connection status is listed below."
          }
        >
          <svg className="map-lines" viewBox="0 0 420 270" aria-hidden="true">
            <ellipse cx="210" cy="135" rx="172" ry="99" />
            <ellipse cx="210" cy="135" rx="109" ry="62" />
            <path d="M75 58 210 135 345 58M75 218 210 135 345 218M210 135v100" />
          </svg>
          <div className="map-center">
            <Icon name="layers" />
            <strong>Agenting OS</strong>
            <span>ORCHESTRATOR</span>
          </div>
          {["codex", "claude", "opencode", "antigravity"].map((id, i) => (
            <div
              className={`map-node node-${i} state-${mapState(id)}`}
              key={id}
            >
              <span className="picker-glyph">
                <ProviderIcon provider={id} />
                {mapState(id) !== "none" && (
                  <i className="connection-dot" aria-hidden="true" />
                )}
              </span>
              <span>
                {
                  (
                    {
                      codex: "Codex",
                      claude: "Claude",
                      opencode: "OpenCode",
                      antigravity: "Antigravity",
                    } as Record<string, string>
                  )[id]
                }
              </span>
            </div>
          ))}
          <div className="map-memory">
            <Icon name="memory" />
            {language === "pl" ? "Wspólna pamięć" : "Shared memory"}
          </div>
        </div>
      </div>
      {work && (
        <section className="now-strip" aria-labelledby="now-title">
          <h2 id="now-title" className="cc-section">
            {language === "pl" ? "Teraz" : "Right now"}
          </h2>
          <div className="now-grid">
            <button
              className={`now-tile ${work.decisions.length ? "tone-warning" : ""}`}
              onClick={onOpenInbox}
            >
              <span className="stat-value">
                <Icon name="inbox" />
                {work.decisions.length}
              </span>
              <span className="stat-label">
                {language === "pl"
                  ? "czeka na Twoją decyzję →"
                  : "waiting for your decision →"}
              </span>
            </button>
            <button className="now-tile" onClick={onOpenInbox}>
              <span className="stat-value">
                <Icon name="clock" />
                {work.active.length}
              </span>
              <span className="stat-label">
                {language === "pl" ? "prac w toku" : "items in progress"}
              </span>
            </button>
            <div className="now-tile">
              <span className="stat-value">
                <Icon name="shield" />
                {scan?.capabilities
                  ? `${scan.capabilities.filter((c) => c.verdict === "verified").length}/${scan.capabilities.filter((c) => c.configured).length}`
                  : "–"}
              </span>
              <span className="stat-label">
                {language === "pl"
                  ? "połączonych agentów zweryfikowanych realnym zadaniem"
                  : "connected agents verified by a real run"}
              </span>
            </div>
          </div>
          {work.decisions.length > 0 && (
            <ul className="inbox-list now-list">
              {work.decisions.slice(0, 3).map((item) => (
                <li className="inbox-item" key={`${item.kind}:${item.id}`}>
                  <div className="inbox-copy">
                    <strong>{attentionWords[language].kinds[item.kind]}</strong>
                    <small>
                      {item.projectName} · {item.title}
                    </small>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => onOpenAttention?.(item)}
                  >
                    {attentionWords[language].open}
                    <Icon name="chevron" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
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
            {scan ? `${ready}/${runnable.length}` : "–"}
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
        <li>
          <button className="quota-stat-button" onClick={onOpenQuota}>
            <span className="stat-value">
              <Icon name="tokens" />
              OpenQuota
            </span>
            <span className="stat-label">
              {language === "pl"
                ? "Zobacz limity i budżety →"
                : "View limits & budgets →"}
            </span>
          </button>
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
            const hasRuns =
              c.adapter === "available" || c.adapter === "requires-bridge";
            return (
              <article
                className={`connector-card ${TONES[c.state]}`}
                key={c.id}
                data-connector={c.id}
              >
                <header>
                  <ProviderIcon provider={c.id} />
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
                {c.state === "ready" &&
                  c.adapter === "available" &&
                  scan?.capabilities?.find((cap) => cap.agent === c.id)
                    ?.live !== "passed" && (
                    <p className="smoke-note">
                      <Icon name="info" />
                      {t.smokeNote}
                    </p>
                  )}
                {c.adapter === "available" && (
                  <button className="connector-configure" onClick={onConfigure}>
                    <Icon name="connections" />
                    {language === "pl"
                      ? "Ustaw połączenie"
                      : "Configure connection"}
                    <Icon name="chevron" />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      {scan?.capabilities && (
        <CapabilityMatrix
          capabilities={scan.capabilities}
          language={language}
        />
      )}
      <DataPanel language={language} />
      <p className="cc-safety">
        <Icon name="shield" />
        {t.safety}
      </p>
    </section>
  );
}
