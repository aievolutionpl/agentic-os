import React, { useEffect, useState } from "react";
import type { AttentionItem, WorkBoard as Board } from "../shared";
import { ProviderIcon } from "./ProviderIcon";
import { agentName, Icon, relativeTime } from "./ui";

const stages = ["queue", "working", "waiting", "done"] as const;
export function WorkBoard({
  pl,
  onOpen,
}: {
  pl: boolean;
  onOpen: (item: AttentionItem) => void;
}) {
  const [board, setBoard] = useState<Board | null>(null),
    [failed, setFailed] = useState(false),
    [project, setProject] = useState("");
  useEffect(() => {
    let alive = true,
      pending = false;
    async function load() {
      if (pending || !window.agenting?.workBoard) return;
      pending = true;
      try {
        const value = await window.agenting.workBoard();
        if (alive) {
          setBoard(value);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      } finally {
        pending = false;
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const cards =
    board?.cards.filter((c) => !project || c.projectId === project) ?? [];
  const active = cards.filter((c) => c.stage === "working");
  const chats =
    board?.conversations.filter((c) => !project || c.projectId === project) ??
    [];
  const projects = new Map(
    board?.cards.map((c) => [c.projectId, c.projectName]),
  );
  const names = pl
    ? {
        queue: "Kolejka",
        working: "W pracy",
        waiting: "Oczekuje",
        done: "Zakończone",
      }
    : {
        queue: "Queue",
        working: "In progress",
        waiting: "Pending",
        done: "Done",
      };
  function open(card: Board["cards"][number]) {
    onOpen({
      id: card.id,
      taskId: card.id,
      projectId: card.projectId,
      projectName: card.projectName,
      title: card.title,
      agent: card.agent,
      at: card.at,
      target: "tasks",
      kind: "run_active",
      reason: null,
    });
  }
  return (
    <section
      className="work-board"
      aria-label={pl ? "Tablica pracy Kanban" : "Kanban work board"}
    >
      <header className="board-heading">
        <div>
          <span className="section-eyebrow">WORKSPACE / LIVE</span>
          <h2>{pl ? "Praca Twojego zespołu" : "Your team at work"}</h2>
        </div>
        <select
          aria-label={pl ? "Projekt tablicy" : "Board project"}
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">{pl ? "Wszystkie projekty" : "All projects"}</option>
          {[...projects].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </header>
      {failed && (
        <p className="error" role="alert">
          {pl
            ? "Odczyt przerwany — wyświetlam ostatni znany stan."
            : "Refresh interrupted — showing last known state."}
        </p>
      )}
      <div
        className={`agent-live ${active.length + chats.length ? "is-working" : ""}`}
      >
        <div className="live-summary">
          <span className="status-dot" />
          <strong>
            {active.length + chats.length
              ? `${active.length + chats.length} ${pl ? "aktywnych agentów" : "active agents"}`
              : pl
                ? "Zespół gotowy do pracy"
                : "Team ready to work"}
          </strong>
          <small>
            {pl
              ? "Rzeczywiste zdarzenia · odświeżanie co 3 s"
              : "Actual events · refreshes every 3s"}
          </small>
        </div>
        <div className="live-agents">
          {active.map((c) => (
            <button key={c.id} onClick={() => open(c)}>
              <ProviderIcon provider={c.agent} />
              <span>
                <strong>{agentName(c.agent)}</strong>
                <small>
                  {c.state} · {c.activity || c.title}
                </small>
              </span>
              <span className="live-pulse" />
            </button>
          ))}
          {chats.map((c) => (
            <div key={c.id}>
              <ProviderIcon provider={c.agent} />
              <span>
                <strong>
                  {agentName(c.agent)} · {pl ? "rozmowa" : "conversation"}
                </strong>
                <small>{c.activity || c.title}</small>
              </span>
              <span className="live-pulse" />
            </div>
          ))}
        </div>
      </div>
      <div className="kanban-grid">
        {stages.map((stage) => (
          <section
            className={`kanban-column stage-${stage}`}
            key={stage}
            aria-label={names[stage]}
          >
            <h3>
              <span className="status-dot" />
              {names[stage]}
              <span className="column-count">
                {cards.filter((c) => c.stage === stage).length}
              </span>
            </h3>
            <div className="kanban-cards">
              {cards
                .filter((c) => c.stage === stage)
                .map((card) => (
                  <button
                    className="kanban-card"
                    key={card.id}
                    onClick={() => open(card)}
                  >
                    <small className="kanban-project">{card.projectName}</small>
                    <strong>{card.title.split("\n")[0]}</strong>
                    <span className="kanban-state">
                      {card.blockedBy
                        ? `${card.blockedBy} ${pl ? "zależności" : "dependencies"}`
                        : card.state}
                    </span>
                    {card.activity && <p>{card.activity}</p>}
                    <footer>
                      <span>
                        <ProviderIcon provider={card.agent} />
                        {agentName(card.agent)}
                      </span>
                      <time>
                        {relativeTime(
                          new Date(card.at).toISOString(),
                          pl ? "pl" : "en",
                        )}
                      </time>
                    </footer>
                  </button>
                ))}
            </div>
            {!cards.some((c) => c.stage === stage) && (
              <p className="kanban-empty">
                <Icon name={stage === "done" ? "check" : "task"} />
                {pl ? "Brak zadań" : "No tasks"}
              </p>
            )}
          </section>
        ))}
      </div>
      <p className="helper">
        {pl
          ? "Otwórz kartę, aby uruchomić zadanie, przejrzeć wynik lub zatwierdzić zmiany. Etapy wynikają ze stanu pracy agenta."
          : "Open a card to start a task, review its result or approve changes. Stages follow the agent's actual work state."}
      </p>
    </section>
  );
}
