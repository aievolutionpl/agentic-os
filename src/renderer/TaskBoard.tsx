import React, { useEffect, useRef, useState } from "react";
import type { Task, TaskAction, TaskEvent } from "../shared";
import { words } from "./i18n";
import {
  AgentAvatar,
  agentName,
  Icon,
  Modal,
  relativeTime,
  SelectField,
} from "./ui";

type Props = {
  tasks: Task[];
  events: TaskEvent[];
  language: "pl" | "en";
  busy: boolean;
  loading: boolean;
  query: string;
  filter: string;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onCompose: () => void;
  onRefresh: () => void;
  onAction: (
    task: Task,
    action: TaskAction["action"],
    dependencyIds?: string[],
  ) => Promise<boolean>;
};

function TaskMenu({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <details
      className="task-menu"
      ref={ref}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && ref.current) {
          event.stopPropagation();
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary title={label} aria-label={label}>
        <Icon name="dots" />
      </summary>
      <div
        className="menu-actions"
        onClick={() => {
          if (ref.current) ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}

export function TaskBoard(props: Props) {
  const {
    tasks,
    events,
    language,
    busy,
    loading,
    query,
    filter,
    onQuery,
    onFilter,
    onAction,
  } = props;
  const w = words[language];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Task | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return (
        localStorage.getItem("agenting.ui.lifecycle-notice.v1") === "dismissed"
      );
    } catch {
      return false;
    }
  });
  const [, refreshClock] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => refreshClock((value) => value + 1),
      60000,
    );
    return () => clearInterval(timer);
  }, []);
  const selected = tasks.find((task) => task.id === selectedId);
  const visible = tasks.filter(
    (task) =>
      (filter === "all" || filter === task.status) &&
      task.title
        .toLocaleLowerCase(language)
        .includes(query.toLocaleLowerCase(language)),
  );
  const lastActivity = (task: Task) =>
    events
      .filter((event) => event.taskId === task.id)
      .reduce((at, event) => (event.at > at ? event.at : at), task.createdAt);
  const actions = (task: Task) => [
    ...(task.status === "draft" ? ["queue" as const] : []),
    ...(task.status === "failed" && task.attempt < 3 ? ["retry" as const] : []),
    ...(["draft", "queued", "failed"].includes(task.status)
      ? ["cancel" as const]
      : []),
  ];
  function act(task: Task, action: "queue" | "retry" | "cancel") {
    if (action === "cancel") setCancelling(task);
    else void onAction(task, action);
  }
  return (
    <section className="task-list" aria-labelledby="tasks-heading">
      <div className="section-heading task-heading">
        <h2 id="tasks-heading">
          {w.tasks} <span className="count">{tasks.length}</span>
        </h2>
        <div className="task-tools">
          <label className="search-field">
            <Icon name="search" />
            <input
              id="task-search"
              type="search"
              aria-label={w.searchTasks}
              placeholder={w.searchTasks}
              value={query}
              onChange={(event) => onQuery(event.target.value)}
            />
            <kbd aria-hidden="true">/</kbd>
          </label>
          <SelectField
            label={w.filterTasks}
            value={filter}
            onChange={onFilter}
            options={[
              { value: "all", label: w.allTasks },
              ...Object.entries(w.statuses).map(([value, label]) => ({
                value,
                label,
                tone: value,
              })),
            ]}
          />
        </div>
      </div>
      {loading ? (
        <div className="skeleton-list" aria-label={w.loading}>
          {[0, 1, 2].map((index) => (
            <div className="skeleton-row" key={index}>
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : !tasks.length ? (
        <div className="empty-list">
          <Icon name="task" />
          <p>{w.noTasks}</p>
          <button className="secondary" onClick={props.onCompose}>
            {w.firstTask}
          </button>
        </div>
      ) : (
        <>
          <div className="task-columns" aria-hidden="true">
            <span>{w.taskColumn}</span>
            <span>{w.statusLabel}</span>
            <span>{w.agentsLabel}</span>
            <span>{w.updated}</span>
            <span />
          </div>
          <ul>
            {visible.map((task) => (
              <li
                key={task.id}
                data-status={task.status}
                className={selectedId === task.id ? "is-selected" : ""}
                onClick={(event) => {
                  if (
                    !(event.target as HTMLElement).closest(
                      "button,details,input,label",
                    )
                  )
                    setSelectedId(task.id);
                }}
              >
                <div className="task-name-cell">
                  <button
                    type="button"
                    className="task-selector icon-button"
                    aria-label={`${w.taskDetails}: ${task.title}`}
                    title={w.taskDetails}
                    onClick={() => setSelectedId(task.id)}
                  >
                    <Icon name="task" />
                  </button>
                  <div>
                    <h3 className="task-title">
                      <button
                        type="button"
                        onClick={() => setSelectedId(task.id)}
                      >
                        {task.title}
                      </button>
                    </h3>
                    {task.status === "queued" && !task.ready && (
                      <p className="task-blocked">{w.blocked}</p>
                    )}
                    {task.failure && (
                      <p className="task-failure">{w.failures[task.failure]}</p>
                    )}
                  </div>
                </div>
                <span
                  className={`badge status-badge tone-${task.status}`}
                  title={
                    task.status === "running"
                      ? w.leaseStateHint
                      : task.status === "draft"
                        ? w.draftState
                        : task.status === "queued"
                          ? w.ready
                          : undefined
                  }
                >
                  <span className="status-dot" aria-hidden="true" />
                  {w.statuses[task.status]}
                </span>
                <div
                  className="task-agents"
                  title={`${agentName(task.implementer)} → ${agentName(task.reviewer)}`}
                >
                  <AgentAvatar agent={task.implementer} />
                  <span aria-hidden="true">→</span>
                  <AgentAvatar agent={task.reviewer} />
                </div>
                <time
                  className="task-time"
                  dateTime={lastActivity(task)}
                  title={new Date(lastActivity(task)).toLocaleString(language)}
                >
                  {relativeTime(lastActivity(task), language)}
                </time>
                <div className="task-row-actions">
                  {actions(task)
                    .filter((action) => action !== "cancel")
                    .map((action) => (
                      <button
                        className="ghost task-quick-action"
                        key={action}
                        disabled={busy || loading}
                        onClick={() => act(task, action)}
                      >
                        {w.actions[action]}
                      </button>
                    ))}
                  <TaskMenu label={`${w.moreActions}: ${task.title}`}>
                    <button onClick={() => setSelectedId(task.id)}>
                      {w.taskDetails}
                    </button>
                    {actions(task).map((action) => (
                      <button
                        className={action === "cancel" ? "cancel-action" : ""}
                        key={action}
                        disabled={busy || loading}
                        onClick={() => act(task, action)}
                      >
                        {w.actions[action]}
                      </button>
                    ))}
                  </TaskMenu>
                </div>
              </li>
            ))}
          </ul>
          {!visible.length && (
            <div className="empty-list" role="status">
              <Icon name="search" />
              <p>{w.noMatches}</p>
              <button
                className="secondary"
                onClick={() => {
                  onQuery("");
                  onFilter("all");
                }}
              >
                {w.clearFilters}
              </button>
            </div>
          )}
        </>
      )}
      {!dismissed && (
        <aside className="info-callout">
          <Icon name="info" />
          <div>
            <strong>{w.executionDisabled}</strong>
            <p>{w.lifecycleNote}</p>
          </div>
          <button
            className="icon-button"
            title={w.dismiss}
            aria-label={w.dismiss}
            onClick={() => {
              setDismissed(true);
              try {
                localStorage.setItem(
                  "agenting.ui.lifecycle-notice.v1",
                  "dismissed",
                );
              } catch {
                /* UI remains dismissible without storage. */
              }
            }}
          >
            <Icon name="close" />
          </button>
        </aside>
      )}
      <details className="journal">
        <summary>
          <Icon name="chevron" />
          {w.journal}
          <span className="count">{events.length}</span>
        </summary>
        <div className="journal-body">
          <button
            className="ghost refresh-events"
            disabled={busy || loading}
            onClick={props.onRefresh}
          >
            <Icon name="clock" />
            {w.refreshEvents}
          </button>
          {!events.length && <p className="helper">{w.noEvents}</p>}
          <ol className="event-journal">
            {events.map((event) => (
              <li key={event.seq}>
                <span className="timeline-dot" aria-hidden="true" />
                <time
                  dateTime={event.at}
                  title={new Date(event.at).toLocaleString(language)}
                >
                  {new Date(event.at).toLocaleTimeString(language, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                <div>
                  <strong>{w.events[event.kind]}</strong>
                  <p>
                    {tasks.find((task) => task.id === event.taskId)?.title ??
                      event.taskId}
                  </p>
                  <span className="event-actor">
                    {event.actor} · {w.attempt} {event.attempt}
                    {event.failure && ` · ${w.failures[event.failure]}`}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </details>
      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        titleId="task-panel-title"
        className="task-panel"
      >
        {selected && (
          <>
            <div className="panel-header">
              <span className="eyebrow">{w.taskDetails}</span>
              <button
                className="icon-button"
                title={w.close}
                aria-label={w.close}
                onClick={() => setSelectedId(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <h2 id="task-panel-title">{selected.title}</h2>
            <span className={`badge status-badge tone-${selected.status}`}>
              <span className="status-dot" />
              {w.statuses[selected.status]}
            </span>
            <dl className="task-properties">
              <div>
                <dt>{w.implementer}</dt>
                <dd>{agentName(selected.implementer)}</dd>
              </div>
              <div>
                <dt>{w.reviewer}</dt>
                <dd>{agentName(selected.reviewer)}</dd>
              </div>
              <div>
                <dt>{w.attempt}</dt>
                <dd>{selected.attempt}/3</dd>
              </div>
              <div>
                <dt>{w.updated}</dt>
                <dd>
                  {new Date(lastActivity(selected)).toLocaleString(language)}
                </dd>
              </div>
            </dl>
            {selected.status === "queued" && (
              <p className="helper">{selected.ready ? w.ready : w.blocked}</p>
            )}
            {selected.owner && (
              <p className="helper">
                {w.lease}: {selected.owner} ·{" "}
                {new Date(selected.expiresAt!).toLocaleString(language)}
              </p>
            )}
            {selected.failure && (
              <p className="task-failure">{w.failures[selected.failure]}</p>
            )}
            <section className="dependency-section">
              <h3>{w.dependencies}</h3>
              {selected.status === "draft" ? (
                tasks.filter((task) => task.id !== selected.id).length ? (
                  <fieldset disabled={busy || loading}>
                    <legend className="sr-only">
                      {w.dependencies}: {selected.title}
                    </legend>
                    {tasks
                      .filter((task) => task.id !== selected.id)
                      .map((task) => (
                        <label key={task.id} className="dependency-choice">
                          <input
                            type="checkbox"
                            checked={selected.dependencies.includes(task.id)}
                            onChange={(event) => {
                              const ids = event.target.checked
                                ? [...selected.dependencies, task.id]
                                : selected.dependencies.filter(
                                    (id) => id !== task.id,
                                  );
                              void onAction(selected, "dependencies", ids);
                            }}
                          />
                          <span>{task.title}</span>
                        </label>
                      ))}
                  </fieldset>
                ) : (
                  <p className="helper">{w.noDependencies}</p>
                )
              ) : (
                <p className="helper">
                  {selected.dependencies
                    .map(
                      (id) => tasks.find((task) => task.id === id)?.title ?? id,
                    )
                    .join(", ") || w.noDependencies}
                </p>
              )}
            </section>
            <div className="panel-actions">
              {actions(selected).map((action) => (
                <button
                  className={
                    action === "cancel" ? "cancel-action" : "secondary"
                  }
                  disabled={busy || loading}
                  key={action}
                  onClick={() => act(selected, action)}
                >
                  {w.actions[action]}
                </button>
              ))}
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        titleId="cancel-title"
        className="confirm-dialog"
      >
        <h2 id="cancel-title">{w.cancelAsk}</h2>
        <p>{cancelling?.title}</p>
        <p className="helper">{w.cancelHint}</p>
        <div className="dialog-actions">
          <button autoFocus disabled={busy} onClick={() => setCancelling(null)}>
            {w.keepTask}
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              if (cancelling)
                void onAction(cancelling, "cancel").then((ok) => {
                  if (ok) setCancelling(null);
                });
            }}
          >
            {w.actions.cancel}
          </button>
        </div>
      </Modal>
    </section>
  );
}
