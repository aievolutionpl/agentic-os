import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  Agent,
  Memory,
  Preferences,
  ProjectData,
  Snapshot,
} from "../shared";
import { words } from "./i18n";
import "./style.css";
const api = window.agenting;
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [projectId, setProjectId] = useState(""),
    [data, setData] = useState<ProjectData>({
      tasks: [],
      memory: [],
      events: [],
    });
  const [tab, setTab] = useState<"tasks" | "memory" | "agents">("tasks"),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false),
    [deleting, setDeleting] = useState<Memory | null>(null),
    [implementer, setImplementer] = useState<Agent>("codex"),
    [query, setQuery] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const projectsToggle = useRef<HTMLButtonElement>(null);
  const projectDialog = useRef<HTMLDialogElement>(null),
    deleteDialog = useRef<HTMLDialogElement>(null),
    selection = useRef("");
  const prefs = snapshot?.preferences ?? { language: "pl", theme: "dark" },
    w = words[prefs.language];
  const project = snapshot?.projects.find((p) => p.id === projectId);
  const visibleTasks = data.tasks.filter((task) =>
    (taskFilter === "all" || task.status === taskFilter) &&
    task.title.toLocaleLowerCase(prefs.language).includes(taskQuery.toLocaleLowerCase(prefs.language)),
  );
  const visibleMemory = data.memory.filter((memory) =>
    (memory.content + " " + memory.source).toLocaleLowerCase(prefs.language)
      .includes(query.toLocaleLowerCase(prefs.language)),
  );
  useEffect(() => {
    if (project) setImplementer(project.master);
  }, [projectId, project?.master]);
  useEffect(() => {
    document.documentElement.lang = prefs.language;
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.language, prefs.theme]);
  async function refresh() {
    if (!api) return;
    try {
      setLoading(true);
      const next = await api.snapshot();
      setSnapshot(next);
      setError(false);
      const chosen =
        next.projects.find((p) => p.id === selection.current) ??
        next.projects[0];
      if (chosen) await selectProject(chosen.id);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function selectProject(id: string) {
    if (projectsExpanded) {
      setProjectsExpanded(false);
      projectsToggle.current?.focus();
    }
    selection.current = id;
    setProjectId(id);
    setData({ tasks: [], memory: [], events: [] });
    setQuery("");
    setTaskQuery("");
    setTaskFilter("all");
    setLoading(true);
    setError(false);
    try {
      const next = await api!.projectData(id);
      if (selection.current === id) {
        setData(next);
      }
    } catch {
      if (selection.current === id) setError(true);
    } finally {
      if (selection.current === id) setLoading(false);
    }
  }
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setError(false);
    setNotice(false);
    try {
      await action();
      setNotice(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  async function reloadProject(id: string) {
    const next = await api!.projectData(id);
    if (selection.current === id) setData(next);
  }
  async function preferences(patch: Partial<Preferences>) {
    await mutate(async () => {
      const next = await api!.setPreferences({ ...prefs, ...patch });
      setSnapshot((s) => (s ? { ...s, preferences: next } : s));
    });
  }
  useEffect(() => {
    if (projectOpen) projectDialog.current?.showModal();
    else projectDialog.current?.close();
  }, [projectOpen]);
  useEffect(() => {
    if (deleting) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleting]);
  if (!api)
    return (
      <main className="standalone">
        <h1>Agenting OS</h1>
        <p>{w.desktopOnly}</p>
      </main>
    );
  return (
    <div className="shell">
      <aside id="project-navigation" className="project-sidebar" data-expanded={projectsExpanded}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />
            </svg>
          </span>
          <strong>Agenting OS</strong>
        </div>
        <div className="project-heading">
          <h2>{w.projects}</h2>
          <button
            className="small"
            disabled={busy}
            aria-label={w.newProject}
            onClick={() => setProjectOpen(true)}
          >
            +
          </button>
        </div>
        <nav aria-label={w.projects}>
          {snapshot?.projects.map((p, index) => (
            <button
              key={p.id}
              disabled={busy}
              className={`project-link ${p.id === projectId ? "selected" : ""}`}
              aria-current={p.id === projectId ? "page" : undefined}
              onClick={() => void selectProject(p.id)}
            >
              <span className="project-symbol" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{p.name}</span>
            </button>
          ))}
        </nav>
        <button
          className="new-project"
          disabled={busy}
          onClick={() => setProjectOpen(true)}
        >
          <span aria-hidden="true">+ </span>{w.newProject}
        </button>
        <div className="sidebar-bottom">
          <span className="local-indicator" aria-hidden="true" />
          {w.local}
          <p>{w.footer}</p>
        </div>
      </aside>
      <div className="body">
        <header>
          <button
            ref={projectsToggle}
            className="projects-toggle"
            aria-label={w.projects}
            aria-controls="project-navigation"
            aria-expanded={projectsExpanded}
            onClick={() => setProjectsExpanded((open) => !open)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" />
            </svg>
          </button>
          <div className="breadcrumb">
            {w.workspace}
            <span aria-hidden="true"> / </span>
            <strong>{project?.name ?? "Agenting OS"}</strong>
          </div>
          <div className="settings">
            <label>
              <span className="sr-only">{w.language}</span>
              <select
                aria-label={w.language}
                value={prefs.language}
                disabled={busy || loading || !snapshot}
                onChange={(e) =>
                  void preferences({
                    language: e.target.value as Preferences["language"],
                  })
                }
              >
                <option value="pl">Polski</option>
                <option value="en">English</option>
              </select>
            </label>
            <button
              disabled={busy || loading || !snapshot}
              aria-label={w.theme}
              onClick={() =>
                void preferences({
                  theme: prefs.theme === "dark" ? "light" : "dark",
                })
              }
            >
              {prefs.theme === "dark" ? w.light : w.dark}
            </button>
          </div>
        </header>
        <main aria-busy={busy || loading}>
          {error && (
            <div className="error" role="alert">
              {w.error}{" "}
              <button onClick={() => void refresh()}>{w.retry}</button>
            </div>
          )}
          <p className="save-status" role="status">
            {busy ? w.loading : notice ? w.saved : loading ? w.loading : ""}
          </p>
          {!snapshot && !error ? (
            <p>{w.loading}</p>
          ) : !project ? (
            <section className="empty">
              <div className="empty-mark" aria-hidden="true">
                ◇
              </div>
              <h1>{w.empty}</h1>
              <p>{w.intro}</p>
              <button className="primary" onClick={() => setProjectOpen(true)}>
                {w.newProject}
              </button>
            </section>
          ) : (
            <>
              <div className="page-title">
                <div>
                  <p className="eyebrow">{w.work}</p>
                  <h1>{project.name}</h1>
                  <p>{project.root || w.scope}</p>
                </div>
                <span className="policy">{w.safety}</span>
              </div>
              <nav className="tabs" aria-label={w.work}>
                {(["tasks", "memory", "agents"] as const).map((t) => (
                  <button
                    key={t}
                    aria-current={tab === t ? "page" : undefined}
                    className={tab === t ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {w[t]} {t === "tasks" && <span>{data.tasks.length}</span>}
                    {t === "memory" && <span>{data.memory.length}</span>}
                  </button>
                ))}
              </nav>
              {tab === "tasks" && (
                <>
                  <section className="composer">
                    <h2>{w.title}</h2>
                    <p>{w.subtitle}</p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget,
                          fd = new FormData(form),
                          id = projectId;
                        void mutate(async () => {
                          await api.createTask({
                            projectId: id,
                            title: String(fd.get("title")),
                            implementer,
                            reviewer:
                              implementer === "codex" ? "claude" : "codex",
                          });
                          setDrafts((current) => ({ ...current, [id]: "" }));
                          form.reset();
                          await reloadProject(id);
                        });
                      }}
                    >
                      <label htmlFor="task-title" className="sr-only">
                        {w.taskTitle}
                      </label>
                      <textarea
                        id="task-title"
                        name="title"
                        required
                        maxLength={4000}
                        placeholder={w.taskTitle}
                        disabled={busy}
                        value={drafts[projectId] ?? ""}
                        onChange={(e) => {
                          const title = e.target.value;
                          setDrafts((current) => ({ ...current, [projectId]: title }));
                        }}
                      />
                      <div className="role-bar">
                        <label>
                          {w.implementer}
                          <select
                            aria-label={w.implementer}
                            value={implementer}
                            disabled={busy}
                            onChange={(e) =>
                              setImplementer(e.target.value as Agent)
                            }
                          >
                            <option value="codex">Codex</option>
                            <option value="claude">Claude Code</option>
                          </select>
                        </label>
                        <span className="role-arrow" aria-hidden="true">
                          ↔
                        </span>
                        <div>
                          <span>{w.reviewer}</span>
                          <strong>
                            {implementer === "codex" ? "Claude Code" : "Codex"}
                          </strong>
                        </div>
                        <button className="primary" disabled={busy || loading}>
                          {w.draft}
                        </button>
                      </div>
                      <p className="helper">{w.roleNote}</p>
                    </form>
                  </section>
                  <section className="task-list" aria-labelledby="tasks-heading">
                    <div className="section-heading task-heading">
                      <h2 id="tasks-heading">{w.tasks} <span className="count">{data.tasks.length}</span></h2>
                      <div className="task-tools">
                        <input type="search" aria-label={w.searchTasks} placeholder={w.searchTasks}
                          value={taskQuery} onChange={(e) => setTaskQuery(e.target.value)} />
                        <select aria-label={w.filterTasks} value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)}>
                          <option value="all">{w.allTasks}</option>
                          {Object.entries(w.statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                    </div>
                    {!data.tasks.length ? (
                      <p className="empty-list">{w.noTasks}</p>
                    ) : (
                      <ul>
                        {visibleTasks.map((t) => (
                          <li key={t.id} data-status={t.status}>
                            <span className="draft-icon" aria-hidden="true">
                              □
                            </span>
                            <div className="task-description">
                              <h3>{t.title}</h3>
                              <p>
                                {t.implementer === "codex"
                                  ? "Codex"
                                  : "Claude Code"}{" "}
                                /{" "}
                                {t.reviewer === "codex"
                                  ? "Codex"
                                  : "Claude Code"}
                              </p>
                              <span className="badge">{w.statuses[t.status]}</span>
                              {t.status === "queued" && <p>{t.ready ? w.ready : w.blocked}</p>}
                              {t.failure && <p>{w.failures[t.failure]}</p>}
                            </div>
                            <div className="task-lifecycle">
                              <details className="task-details">
                                <summary>{w.taskDetails}</summary>
                                <div className="task-detail-content">
                              <p>
                                {w.attempt}: {t.attempt}/3
                              </p>
                              {!!t.dependencies.length && (
                                <p>
                                  {w.dependencies}:{" "}
                                  {t.dependencies
                                    .map(
                                      (id) =>
                                        data.tasks.find(
                                          (task) => task.id === id,
                                        )?.title ?? id,
                                    )
                                    .join(", ")}
                                </p>
                              )}
                              {t.owner && (
                                <p>
                                  {w.lease}: {t.owner} ·{" "}
                                  {new Date(t.expiresAt!).toLocaleString(
                                    prefs.language,
                                  )}
                                </p>
                              )}
                              {t.status === "draft" && (
                                <label>
                                  {w.dependencies}
                                  <select
                                    multiple
                                    aria-label={`${w.dependencies}: ${t.title}`}
                                    disabled={busy || loading}
                                    value={t.dependencies}
                                    onChange={(e) => {
                                      const dependencyIds = Array.from(
                                        e.currentTarget.selectedOptions,
                                        (o) => o.value,
                                      );
                                      void mutate(async () => {
                                        await api.taskAction({
                                          projectId,
                                          id: t.id,
                                          action: "dependencies",
                                          dependencyIds,
                                        });
                                        await reloadProject(projectId);
                                      });
                                    }}
                                  >
                                    {data.tasks
                                      .filter((task) => task.id !== t.id)
                                      .map((task) => (
                                        <option key={task.id} value={task.id}>
                                          {task.title}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                              )}
                                </div>
                              </details>
                              <div className="task-actions">
                              {[
                                ...(t.status === "draft"
                                  ? ["queue" as const]
                                  : []),
                                ...(t.status === "failed" && t.attempt < 3
                                  ? ["retry" as const]
                                  : []),
                                ...(["draft", "queued", "failed"].includes(
                                  t.status,
                                )
                                  ? ["cancel" as const]
                                  : []),
                              ].map((action) => (
                                <button
                                  key={action}
                                  disabled={busy || loading}
                                  onClick={() =>
                                    void mutate(async () => {
                                      await api.taskAction({
                                        projectId,
                                        id: t.id,
                                        action,
                                      });
                                      await reloadProject(projectId);
                                    })
                                  }
                                >
                                  {w.actions[action]}
                                </button>
                              ))}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!!data.tasks.length && !visibleTasks.length && (
                      <div className="empty-list" role="status">
                        <p>{w.noMatches}</p>
                        <button onClick={() => { setTaskQuery(""); setTaskFilter("all"); }}>{w.clearFilters}</button>
                      </div>
                    )}
                    <p className="helper">{w.lifecycleNote}</p>
                    <details className="journal">
                      <summary>{w.journal} <span className="count">{data.events?.length ?? 0}</span></summary>
                    <button
                      disabled={busy || loading}
                      onClick={() =>
                        void mutate(() => reloadProject(projectId))
                      }
                    >
                      {w.refreshEvents}
                    </button>
                    {!data.events?.length && <p className="empty-list">{w.noEvents}</p>}
                    <ol className="event-journal">
                      {(data.events ?? []).map((event) => (
                        <li key={event.seq}>
                          <time dateTime={event.at}>
                            {new Date(event.at).toLocaleString(prefs.language)}
                          </time>
                          {" · "}
                          {data.tasks.find((task) => task.id === event.taskId)
                            ?.title ?? event.taskId}
                          {" · "}
                          {w.events[event.kind]} · {w.attempt} {event.attempt} ·{" "}
                          {event.actor}
                          {event.failure && ` · ${w.failures[event.failure]}`}
                        </li>
                      ))}
                    </ol>
                    </details>
                  </section>
                </>
              )}
              {tab === "memory" && (
                <section>
                  <div className="section-heading">
                    <div>
                      <h2>{w.knowledge}</h2>
                      <p>{w.scope}</p>
                    </div>
                    <label>
                      <span className="sr-only">{w.search}</span>
                      <input
                        aria-label={w.search}
                        placeholder={w.search}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </div>
                  <form
                    className="memory-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget,
                        fd = new FormData(form),
                        id = projectId;
                      void mutate(async () => {
                        await api.createMemory({
                          projectId: id,
                          content: String(fd.get("content")),
                          source: String(fd.get("source")),
                        });
                        form.reset();
                        await reloadProject(id);
                      });
                    }}
                  >
                    <label>
                      {w.content}
                      <textarea
                        name="content"
                        required
                        maxLength={20000}
                        disabled={busy}
                      />
                    </label>
                    <label>
                      {w.source}
                      <input
                        name="source"
                        required
                        maxLength={1000}
                        disabled={busy}
                      />
                    </label>
                    <div className="form-footer">
                      <span className="helper">{w.noSecrets}</span>
                      <button className="primary" disabled={busy || loading}>
                        {w.saveMemory}
                      </button>
                    </div>
                  </form>
                  {!visibleMemory.length ? (
                    <p className="empty-list">{data.memory.length ? w.noMatches : w.noMemory}</p>
                  ) : (
                    <ul className="memories">
                      {visibleMemory
                        .map((m) => (
                          <li key={m.id}>
                            <p className="memory-content">{m.content}</p>
                            <div className="memory-meta">
                              <span>
                                {w.source}: {m.source}
                                <br />
                                <time dateTime={m.createdAt}>
                                  {new Date(m.createdAt).toLocaleString(
                                    prefs.language,
                                  )}
                                </time>
                              </span>
                              <button
                                disabled={busy}
                                onClick={() => setDeleting(m)}
                              >
                                {w.remove}
                              </button>
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                </section>
              )}
              {tab === "agents" && (
                <section>
                  <h2>{w.agents}</h2>
                  <p className="integration-note">{w.integrationNote}</p>
                  <label className="default-master">
                    {w.editRoles}
                    <select
                      aria-label={w.editRoles}
                      value={project.master}
                      disabled={busy}
                      onChange={(e) => {
                        const master = e.target.value as Agent;
                        void mutate(async () => {
                          await api.setMaster({ projectId, master });
                          const next = await api.snapshot();
                          setSnapshot(next);
                          setImplementer(master);
                        });
                      }}
                    >
                      <option value="codex">Codex</option>
                      <option value="claude">Claude Code</option>
                    </select>
                  </label>
                  <div className="integrations">
                    {snapshot?.integrations.map((i) => (
                      <article key={i.id}>
                        <div className="integration-title">
                          <h3>{i.name}</h3>
                          <span className="badge">
                            {i.probe?.installation === "installed"
                              ? w.detected
                              : i.probe?.installation === "not_found"
                                ? w.notDetected
                                : w.notConfigured}
                          </span>
                        </div>
                        {i.probe && (
                          <dl>
                            <div>
                              <dt>{w.probeVersion}</dt>
                              <dd>{i.probe.version ?? w.unknown}</dd>
                            </div>
                            <div>
                              <dt>{w.authStatus}</dt>
                              <dd>{w.unknown}</dd>
                            </div>
                            <div>
                              <dt>{w.capabilityStatus}</dt>
                              <dd>
                                {i.probe.capabilities.version &&
                                i.probe.capabilities.help &&
                                i.probe.capabilities.authStatus
                                  ? w.probePassed
                                  : w.probeUnknown}
                              </dd>
                            </div>
                          </dl>
                        )}
                        <dl>
                          <div>
                            <dt>{w.quota}</dt>
                            <dd>{w.unknown}</dd>
                          </div>
                          <div>
                            <dt>{w.provenance}</dt>
                            <dd>{w.none}</dd>
                          </div>
                          <div>
                            <dt>{w.observed}</dt>
                            <dd>{w.never}</dd>
                          </div>
                          <div>
                            <dt>{w.reset}</dt>
                            <dd>{w.unknown}</dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
      <dialog
        ref={projectDialog}
        aria-labelledby="project-dialog-title"
        onCancel={() => setProjectOpen(false)}
        onClose={() => setProjectOpen(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void mutate(async () => {
              const p = await api.createProject({
                name: String(fd.get("name")),
                root: String(fd.get("root")),
                master: fd.get("master") as Agent,
              });
              const next = await api.snapshot();
              setSnapshot(next);
              setProjectOpen(false);
              await selectProject(p.id);
            });
          }}
        >
          <h2 id="project-dialog-title">{w.newProject}</h2>
          <label>
            {w.name}
            <input
              name="name"
              required
              maxLength={240}
              autoFocus
              disabled={busy}
            />
          </label>
          <label>
            {w.folder}
            <input name="root" maxLength={4096} disabled={busy} />
          </label>
          <p className="helper">{w.projectHint}</p>
          <label>
            {w.editRoles}
            <select name="master" aria-label={w.editRoles} disabled={busy}>
              <option value="codex">Codex</option>
              <option value="claude">Claude Code</option>
            </select>
          </label>
          {error && <p role="alert">{w.error}</p>}
          <div className="dialog-actions">
            <button
              type="button"
              onClick={() => setProjectOpen(false)}
              disabled={busy}
            >
              {w.cancel}
            </button>
            <button className="primary" disabled={busy}>
              {w.create}
            </button>
          </div>
        </form>
      </dialog>
      <dialog
        ref={deleteDialog}
        aria-labelledby="delete-dialog-title"
        onCancel={() => setDeleting(null)}
        onClose={() => setDeleting(null)}
      >
        <h2 id="delete-dialog-title">{w.deleteAsk}</h2>
        <p>{deleting?.content.slice(0, 150)}</p>
        <div className="dialog-actions">
          <button autoFocus onClick={() => setDeleting(null)}>
            {w.cancel}
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              if (!deleting) return;
              const m = deleting;
              void mutate(async () => {
                await api.deleteMemory({ projectId: m.projectId, id: m.id });
                setDeleting(null);
                await reloadProject(m.projectId);
              });
            }}
          >
            {w.confirm}
          </button>
        </div>
      </dialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
