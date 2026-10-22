import React, { useState } from "react";
import type { Agent, Attention, AttentionItem } from "../shared";
import { Icon, agentName, relativeTime } from "./ui";
import { WorkBoard } from "./WorkBoard";

const COPY = {
  en: {
    title: "Work & questions",
    subtitle:
      "Your team, its tasks and the questions that need your attention.",
    decisions: "Pending questions & approvals",
    active: "In progress",
    noDecisions: "Nothing is waiting for you.",
    noActive: "No agent is working right now.",
    open: "Open",
    refresh: "Refresh",
    failed: "Could not read the inbox.",
    kinds: {
      run_review: "Review changes",
      run_interrupted: "Interrupted run",
      apply_uncertain: "Apply result uncertain",
      run_failed: "Run failed",
      batch_interrupted: "Interrupted queue",
      batch_blocked: "Queue blocked",
      mission_ready: "Approve mission plan",
      mission_blocked: "Mission blocked",
      mission_interrupted: "Interrupted mission",
      mission_needs_changes: "Mission needs changes",
      run_active: "Agent working",
      batch_running: "Queue running",
      mission_active: "Mission running",
    },
    queue: "Team queue",
    reasons: {
      APP_INTERRUPTED: "the app stopped during work",
      APP_CLOSED: "the app was closed during work",
      DEPENDENCIES_OR_APPROVAL: "waiting for dependencies or approval",
      RUN_FAILED: "a run failed",
      DISPATCH_FAILED: "could not start the next task",
      USER_STOPPED: "stopped by you",
    } as Record<string, string>,
  },
  pl: {
    title: "Praca i pytania",
    subtitle:
      "Twój zespół, jego zadania i pytania, które potrzebują Twojej uwagi.",
    decisions: "Pytania i zgody oczekujące",
    active: "W toku",
    noDecisions: "Nic na Ciebie nie czeka.",
    noActive: "Żaden agent teraz nie pracuje.",
    open: "Otwórz",
    refresh: "Odśwież",
    failed: "Nie udało się odczytać skrzynki.",
    kinds: {
      run_review: "Przejrzyj zmiany",
      run_interrupted: "Przerwany run",
      apply_uncertain: "Niepewny wynik zastosowania",
      run_failed: "Run zakończony błędem",
      batch_interrupted: "Przerwana kolejka",
      batch_blocked: "Kolejka zablokowana",
      mission_ready: "Zatwierdź plan misji",
      mission_blocked: "Misja zablokowana",
      mission_interrupted: "Przerwana misja",
      mission_needs_changes: "Misja wymaga poprawek",
      run_active: "Agent pracuje",
      batch_running: "Kolejka pracuje",
      mission_active: "Misja w toku",
    },
    queue: "Kolejka zespołu",
    reasons: {
      APP_INTERRUPTED: "aplikacja zatrzymała się w trakcie pracy",
      APP_CLOSED: "aplikację zamknięto w trakcie pracy",
      DEPENDENCIES_OR_APPROVAL: "czeka na zależności lub zgodę",
      RUN_FAILED: "run zakończył się błędem",
      DISPATCH_FAILED: "nie udało się uruchomić kolejnego zadania",
      USER_STOPPED: "zatrzymane przez Ciebie",
    } as Record<string, string>,
  },
};
const TONES: Partial<Record<AttentionItem["kind"], string>> = {
  run_review: "tone-info",
  mission_ready: "tone-info",
  run_failed: "tone-danger",
  apply_uncertain: "tone-danger",
  batch_blocked: "tone-warning",
  mission_blocked: "tone-warning",
  mission_needs_changes: "tone-warning",
};
export const attentionWords = COPY;

function Item({
  item,
  language,
  onOpen,
}: {
  item: AttentionItem;
  language: "pl" | "en";
  onOpen: (item: AttentionItem) => void;
}) {
  const t = COPY[language];
  const queue = item.kind.startsWith("batch_");
  return (
    <li className={`inbox-item ${TONES[item.kind] ?? "tone-muted"}`}>
      <div className="inbox-copy">
        <span className={`state-badge ${TONES[item.kind] ?? "tone-muted"}`}>
          <span className="status-dot" aria-hidden="true" />
          {t.kinds[item.kind]}
        </span>
        <strong>{queue ? `${t.queue} · ${item.title}` : item.title}</strong>
        <small>
          {item.projectName}
          {item.agent && ` · ${agentName(item.agent as Agent) ?? item.agent}`}
          {item.reason && ` · ${t.reasons[item.reason] ?? item.reason}`}
          {item.at > 0 &&
            ` · ${relativeTime(new Date(item.at).toISOString(), language)}`}
        </small>
      </div>
      <button className="secondary" onClick={() => onOpen(item)}>
        {t.open}
        <Icon name="chevron" />
      </button>
    </li>
  );
}

export function Inbox({
  language,
  attention,
  failed,
  onRefresh,
  onOpen,
  onStart,
}: {
  language: "pl" | "en";
  attention: Attention | null;
  failed: boolean;
  onRefresh: () => void;
  onOpen: (item: AttentionItem) => void;
  /** Where to go when nothing waits: a new chat, a project or a connection. */
  onStart?: (target: "chat" | "project" | "connections") => void;
}) {
  const t = COPY[language];
  const pl = language === "pl";
  const [filter, setFilter] = useState<"all" | "review" | "mission" | "blocked">(
    "all",
  );
  // A failed refresh may hide new decisions; never claim "all caught up" then.
  const idle =
    !failed &&
    !!attention &&
    !attention.decisions.length &&
    !attention.active.length;
  const filteredDecisions = (attention?.decisions ?? []).filter((item) => {
    if (filter === "all") return true;
    if (filter === "review") return item.kind === "run_review";
    if (filter === "mission") return item.kind.startsWith("mission_");
    return (
      item.kind === "run_failed" ||
      item.kind === "run_interrupted" ||
      item.kind === "apply_uncertain" ||
      item.kind.startsWith("batch_")
    );
  });
  return (
    <section className="inbox" aria-labelledby="inbox-title">
      <div className="cc-head">
        <div>
          <h1 id="inbox-title">{t.title}</h1>
          <p className="cc-subtitle">{t.subtitle}</p>
        </div>
        <div className="cc-actions">
          {attention && (
            <span className="cc-scanned">
              {relativeTime(attention.observedAt, language)}
            </span>
          )}
          <button className="secondary" onClick={onRefresh}>
            <Icon name="refresh" />
            {t.refresh}
          </button>
        </div>
      </div>
      {failed && (
        <div className="error" role="alert">
          <Icon name="info" />
          <span>{t.failed}</span>
        </div>
      )}
      <WorkBoard pl={language === "pl"} onOpen={onOpen} />
      <h2 className="cc-section">
        {t.decisions}
        {attention ? ` (${attention.decisions.length})` : ""}
      </h2>
      {!!attention?.decisions.length && (
        <div
          className="harness-slash-bar"
          style={{ padding: "0 0 10px" }}
        >
          {(
            [
              { id: "all", label: pl ? "Wszystkie" : "All" },
              { id: "review", label: pl ? "Diff & Recenzje" : "Diff & Reviews" },
              { id: "mission", label: pl ? "Misje Mastera" : "Master Missions" },
              { id: "blocked", label: pl ? "Blokady & Błędy" : "Blocked & Errors" },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={filter === cat.id ? "primary" : "secondary"}
              style={{ fontSize: "0.76rem", padding: "0.28rem 0.65rem" }}
              onClick={() => setFilter(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}
      {filteredDecisions.length ? (
        <ul className="inbox-list">
          {filteredDecisions.map((item) => (
            <Item
              key={`${item.kind}:${item.id}`}
              item={item}
              language={language}
              onOpen={onOpen}
            />
          ))}
        </ul>
      ) : (
        <p className="inbox-empty">
          <Icon name="check" />
          {attention ? t.noDecisions : "…"}
        </p>
      )}
      <h2 className="cc-section">
        {t.active}
        {attention ? ` (${attention.active.length})` : ""}
      </h2>
      {attention?.active.length ? (
        <ul className="inbox-list">
          {attention.active.map((item) => (
            <Item
              key={`${item.kind}:${item.id}`}
              item={item}
              language={language}
              onOpen={onOpen}
            />
          ))}
        </ul>
      ) : (
        <p className="inbox-empty">
          <Icon name="clock" />
          {attention ? t.noActive : "…"}
        </p>
      )}
      {idle && onStart && (
        <div className="inbox-start">
          <p>
            {language === "pl"
              ? "Wszystko załatwione. Co dalej?"
              : "All caught up. What's next?"}
          </p>
          <div className="panel-actions">
            <button className="primary" onClick={() => onStart("chat")}>
              <Icon name="message" />
              {language === "pl" ? "Nowy czat" : "New chat"}
            </button>
            <button className="secondary" onClick={() => onStart("project")}>
              <Icon name="plus" />
              {language === "pl" ? "Nowy projekt" : "New project"}
            </button>
            <button
              className="secondary"
              onClick={() => onStart("connections")}
            >
              <Icon name="connections" />
              {language === "pl" ? "Podłącz agenta" : "Connect an agent"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
