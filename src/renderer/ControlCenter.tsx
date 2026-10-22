import React, { useEffect, useState } from "react";
import type {
  Attention,
  AttentionItem,
  ConnectorScan,
  ConnectorStatus,
  Extension,
  ProviderQuotaCard,
  ProviderSetting,
} from "../shared";
import { formatUsd, quotaSummary } from "./LimitLink";
import { attentionWords } from "./Inbox";
import { ccWords } from "./cc-i18n";
import { Icon, connectionState, relativeTime } from "./ui";
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
  onDemoProject,
  projectCount = 0,
  work = null,
  onOpenInbox,
  onOpenAttention,
  onOpenSkills,
  agents = [],
}: {
  language: "pl" | "en";
  scan: ConnectorScan | null;
  scanning: boolean;
  failed: boolean;
  onRescan: () => void;
  onOpenQuota?: () => void;
  onConfigure?: () => void;
  onNewProject?: () => void;
  onDemoProject?: () => void;
  projectCount?: number;
  work?: Attention | null;
  onOpenInbox?: () => void;
  onOpenAttention?: (item: AttentionItem) => void;
  onOpenSkills?: () => void;
  /** Saved settings with their last recorded check: the map's evidence. */
  agents?: ProviderSetting[];
}) {
  const t = ccWords[language];
  const pl = language === "pl";
  // Shared, cached quota reading: real limits and balances per provider.
  const [quota, setQuota] = useState<ProviderQuotaCard[]>([]);
  const [skills, setSkills] = useState<Extension[]>([]);
  const [skillFilter, setSkillFilter] = useState<string>("all");
  useEffect(() => {
    let alive = true;
    const load = () =>
      void window.agenting
        ?.quotaScan?.()
        .then((cards) => alive && setQuota(cards))
        .catch(() => {});
    void window.agenting
      ?.skillCatalog?.()
      .then((items) => alive && setSkills(items))
      .catch(() => {});
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [scan?.observedAt]);
  const limitOf = (id: string) =>
    quotaSummary(
      quota.find((c) => c.id === id),
      pl,
    );
  const balance = quota.find(
    (c) => c.id === "openrouter" && typeof c.balanceUsd === "number",
  );
  // Agents whose cards show this account: billed (OpenCode) or for
  // reference (Hermes on its own OpenRouter key).
  const balanceFor = quota
    .filter((c) => c.via === "openrouter")
    .map((c) => c.name)
    .join(", ");
  const connectors = (scan?.connectors ?? []).filter((c) => c.id !== "gemini");
  const runnable = connectors.filter((c) => c.adapter === "available");
  const ready = runnable.filter((c) => c.state === "ready").length;
  const attention = connectors.filter(
    (c) => c.state === "needs-auth" || c.state === "degraded",
  ).length;
  const runsToday = (scan?.usage ?? []).reduce((n, u) => n + u.runsToday, 0);
  const steps = nextSteps(connectors);
  // Same evidence and vocabulary as the Connections cards.
  const mapState = (id: string) =>
    connectionState(
      agents.find((a) => a.id === id),
      !!connectors.find((x) => x.id === id)?.installed,
    );
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
            {onDemoProject && (
              <button className="secondary" onClick={onDemoProject}>
                <Icon name="plan" />
                {language === "pl" ? "Projekt demo (1 klik)" : "Demo project (1 click)"}
              </button>
            )}
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
      <div
        className="harness-pipeline-strip"
        role="region"
        aria-label={
          pl ? "Architektura Harnessu Agentowego" : "Agent Harness Pipeline"
        }
      >
        <button
          type="button"
          className="pipeline-step"
          onClick={onOpenSkills}
        >
          <span className="pipeline-step-index">01 // CONTEXT & SKILLS</span>
          <strong>
            {pl ? "20 Wbudowanych Skilli + Vault" : "20 Built-in Skills + Vault"}
          </strong>
          <small>
            {pl
              ? "Taste-UI, Archify, GWS, Browserbase, Addy Osmani, Superpowers"
              : "Taste-UI, Archify, GWS, Browserbase, Addy Osmani, Superpowers"}
          </small>
        </button>
        <button
          type="button"
          className="pipeline-step"
          onClick={onConfigure}
        >
          <span className="pipeline-step-index">02 // MULTI-AGENT HARNESS</span>
          <strong>
            {pl ? "Codex · Claude Code · OpenCode" : "Codex · Claude Code · OpenCode"}
          </strong>
          <small>
            {pl
              ? "Natywne adaptery CLI, ACP, Hermes oraz lokalne modele Ollama/LM Studio"
              : "Native CLI, ACP, Hermes adapters and local Ollama/LM Studio models"}
          </small>
        </button>
        <button
          type="button"
          className="pipeline-step"
          onClick={onNewProject}
        >
          <span className="pipeline-step-index">03 // SANDBOX ISOLATION</span>
          <strong>
            {pl ? "Izolowane Git Worktree" : "Isolated Git Worktrees"}
          </strong>
          <small>
            {pl
              ? "Każde zadanie działa w osobnej gałęzi roboczej bez ryzyka dla repozytorium"
              : "Every run executes in an isolated worktree without touching your main branch"}
          </small>
        </button>
        <button
          type="button"
          className="pipeline-step"
          onClick={onOpenInbox ?? onOpenQuota}
        >
          <span className="pipeline-step-index">04 // VERIFICATION & GATE</span>
          <strong>
            {pl ? "Diff Studio, Testy & Rollback" : "Diff Studio, Tests & Rollback"}
          </strong>
          <small>
            {pl
              ? "Automatyczna bramka weryfikacyjna i bezpieczne zatwierdzanie 1-klikiem"
              : "Automated verification gate and 1-click safe human approval & rollback"}
          </small>
        </button>
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
        {balance && (
          <li data-stat="openrouter-balance">
            <button className="quota-stat-button" onClick={onOpenQuota}>
              <span className="stat-value">
                <Icon name="tokens" />
                {formatUsd(balance.balanceUsd!, pl)}
              </span>
              <span className="stat-label">
                {pl ? "Saldo OpenRouter" : "OpenRouter balance"}
                {balanceFor && ` · ${balanceFor}`}
              </span>
            </button>
          </li>
        )}
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
                    <div data-limit={limitOf(c.id) ? "known" : "unknown"}>
                      <span className="quota-label">{t.providerLimit}</span>
                      <strong>{limitOf(c.id)?.value ?? t.limitUnknown}</strong>
                      <small>{limitOf(c.id)?.note ?? t.limitUnknownNote}</small>
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
      {skills.length > 0 && (
        <section className="cc-skills-dock" aria-labelledby="cc-skills-title" style={{ marginTop: "2rem" }}>
          <div className="cc-head" style={{ marginBottom: "0.75rem" }}>
            <div>
              <h2 id="cc-skills-title" className="cc-section" style={{ margin: 0 }}>
                {pl
                  ? `Wbudowane Skille w Dashboardzie (${skills.length})`
                  : `Built-in Dashboard Skills (${skills.length})`}
              </h2>
              <p className="cc-subtitle" style={{ margin: "0.25rem 0 0" }}>
                {pl
                  ? "Zintegrowane pakiety z GitHub, OfficialSkills.sh, Google Workspace, Browserbase i AI Evolution."
                  : "Integrated skill packages from GitHub, OfficialSkills.sh, Google Workspace, Browserbase, and AI Evolution."}
              </p>
            </div>
            {onOpenSkills && (
              <button className="secondary" onClick={onOpenSkills}>
                <Icon name="code" />
                {pl ? "Otwórz Bibliotekę Skilli →" : "Open Skill Library →"}
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
            {[
              { id: "all", label: pl ? "Wszystkie" : "All" },
              { id: "engineering", label: pl ? "Inżynieria & QA" : "Engineering & QA" },
              { id: "design", label: pl ? "UI, Taste & Architektura" : "UI, Taste & Architecture" },
              { id: "gws", label: "Google Workspace (GWS)" },
              { id: "growth", label: pl ? "Marketing & Humanizer" : "Marketing & Humanizer" },
              { id: "browser", label: "Browserbase & MCP" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={skillFilter === cat.id ? "primary" : "secondary"}
                style={{ fontSize: "0.76rem", padding: "0.28rem 0.65rem" }}
                onClick={() => setSkillFilter(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div
            className="fleet"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(245px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {skills
              .filter((s) => {
                if (skillFilter === "all") return true;
                const slug = s.slug ?? s.name;
                if (skillFilter === "gws") return slug.startsWith("gws-");
                if (skillFilter === "growth")
                  return slug === "marketingskills" || slug === "humanizer";
                if (skillFilter === "design")
                  return (
                    slug === "taste-skill" ||
                    slug === "archify" ||
                    slug === "frontend-design"
                  );
                if (skillFilter === "browser")
                  return (
                    slug === "browserbase-skills" ||
                    slug === "mcp-builder" ||
                    slug === "webapp-testing"
                  );
                return (
                  slug === "addyosmani-agent-skills" ||
                  slug === "awesome-claude-skills" ||
                  slug === "agentskills-spec" ||
                  slug === "systematic-debugging" ||
                  slug === "test-driven-development" ||
                  slug === "verification-before-completion" ||
                  slug === "requesting-code-review" ||
                  slug === "skill-creator"
                );
              })
              .map((s) => (
                <article
                  key={s.id}
                  className="connector-card tone-info"
                  data-skill-slug={s.slug ?? s.name}
                  style={{ padding: "0.85rem 1rem" }}
                >
                  <header style={{ marginBottom: "0.35rem" }}>
                    <div className="connector-title">
                      <span
                        style={{
                          fontSize: "0.66rem",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          opacity: 0.72,
                        }}
                      >
                        {s.source.includes("officialskills.sh/googleworkspace")
                          ? "OFFICIALSKILLS.SH · GWS"
                          : s.source.includes("officialskills.sh/browserbase")
                            ? "OFFICIALSKILLS.SH · BROWSERBASE"
                            : "OPEN SOURCE · GITHUB"}
                      </span>
                      <h3 style={{ fontSize: "0.95rem", margin: "0.1rem 0" }}>
                        {s.name}
                      </h3>
                    </div>
                  </header>
                  <p
                    className="connector-reason"
                    style={{ fontSize: "0.78rem", margin: "0.2rem 0 0.5rem" }}
                  >
                    {s.author} · {s.license} · {s.version.slice(0, 8)}
                  </p>
                  {onOpenSkills && (
                    <button
                      type="button"
                      className="connector-configure"
                      onClick={onOpenSkills}
                    >
                      <Icon name="plus" />
                      {pl ? "Zarządzaj w Bibliotece Skilli" : "Manage in Skill Library"}
                      <Icon name="chevron" />
                    </button>
                  )}
                </article>
              ))}
          </div>
        </section>
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
