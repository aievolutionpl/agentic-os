import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  Agent,
  Memory,
  Preferences,
  ProjectData,
  Snapshot,
  Task,
  TaskAction,
} from "../shared";
import { words } from "./i18n";
import { agentName, Icon, Modal, SelectField, useNarrow } from "./ui";
import { TaskBoard } from "./TaskBoard";
import { ProviderSetup } from "./ProviderSetup";
import "./style.css";

const api = window.agenting;
const agentChoices = [
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude Code" },
];
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [projectId, setProjectId] = useState("");
  const [data, setData] = useState<ProjectData>({
    tasks: [],
    memory: [],
    events: [],
  });
  const [tab, setTab] = useState<"tasks" | "memory" | "agents">("tasks");
  const [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const [projectOpen, setProjectOpen] = useState(false),
    [deleting, setDeleting] = useState<Memory | null>(null);
  const [implementer, setImplementer] = useState<Agent>("codex"),
    [projectMaster, setProjectMaster] = useState<Agent>("codex");
  const [query, setQuery] = useState(""),
    [taskQuery, setTaskQuery] = useState(""),
    [taskFilter, setTaskFilter] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({}),
    [projectsExpanded, setProjectsExpanded] = useState(false);
  const selection = useRef(""),
    projectsToggle = useRef<HTMLButtonElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    pendingFocus = useRef<HTMLElement | null>(null);
  const narrow = useNarrow();
  const prefs = snapshot?.preferences ?? { language: "pl", theme: "dark" },
    w = words[prefs.language];
  const project = snapshot?.projects.find(
    (project) => project.id === projectId,
  );
  const visibleMemory = data.memory.filter((memory) =>
    (memory.content + " " + memory.source)
      .toLocaleLowerCase(prefs.language)
      .includes(query.toLocaleLowerCase(prefs.language)),
  );
  const draft = drafts[projectId] ?? "";
  useEffect(() => {
    if (project) setImplementer(project.master);
  }, [projectId, project?.master]);
  useEffect(() => {
    document.documentElement.lang = prefs.language;
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.language, prefs.theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (busy) return;
    const target = pendingFocus.current;
    pendingFocus.current = null;
    // Disabling a focused control during an async save moves focus to body.
    // Restore it only if the user has not already focused something else.
    if (
      target?.isConnected &&
      !target.matches(":disabled") &&
      document.activeElement === document.body
    ) {
      target.focus();
    }
  }, [busy]);
  useEffect(() => {
    if (!narrow) setProjectsExpanded(false);
  }, [narrow]);
  useEffect(() => {
    if (composer.current) {
      composer.current.style.height = "auto";
      composer.current.style.height = `${composer.current.scrollHeight}px`;
    }
  }, [draft, tab, projectId]);
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.defaultPrevented ||
        document.querySelector("dialog[open]")
      )
        return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "input,textarea,select,[contenteditable=true],[role=listbox]",
        )
      )
        return;
      const input = document.getElementById("task-search");
      if (input) {
        event.preventDefault();
        input.focus();
      }
    };
    document.addEventListener("keydown", shortcuts);
    return () => document.removeEventListener("keydown", shortcuts);
  }, []);
  async function refresh() {
    if (!api) return;
    try {
      setLoading(true);
      const next = await api.snapshot();
      setSnapshot(next);
      setError(false);
      const chosen =
        next.projects.find((project) => project.id === selection.current) ??
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
      if (selection.current === id) setData(next);
    } catch {
      if (selection.current === id) setError(true);
    } finally {
      if (selection.current === id) setLoading(false);
    }
  }
  async function mutate(action: () => Promise<unknown>, message = w.saved) {
    const active = document.activeElement as HTMLElement | null;
    pendingFocus.current =
      active
        ?.closest(".select-field")
        ?.querySelector<HTMLButtonElement>(".select-trigger") ?? active;
    setBusy(true);
    setError(false);
    setToast(null);
    try {
      await action();
      setSaved(true);
      setToast({ message });
      return true;
    } catch {
      setError(true);
      return false;
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
      setSnapshot((current) =>
        current ? { ...current, preferences: next } : current,
      );
    });
  }
  async function taskAction(
    task: Task,
    action: TaskAction["action"],
    dependencyIds?: string[],
  ) {
    const messages = {
      queue: w.queuedTask,
      cancel: w.cancelledTask,
      retry: w.retriedTask,
      dependencies: w.savedDependencies,
    };
    return mutate(async () => {
      await api!.taskAction({
        projectId: task.projectId,
        id: task.id,
        action,
        ...(dependencyIds ? { dependencyIds } : {}),
      });
      await reloadProject(task.projectId);
    }, messages[action]);
  }
  function copyPath() {
    if (!project?.root) return;
    try {
      // The hardened session denies asynchronous clipboard permissions.
      // Keep this copy within the user's click gesture without changing IPC.
      const focused = document.activeElement as HTMLElement | null;
      const buffer = document.createElement("textarea");
      buffer.value = project.root;
      buffer.className = "clipboard-buffer";
      buffer.readOnly = true;
      document.body.append(buffer);
      buffer.focus({ preventScroll: true });
      buffer.select();
      buffer.setSelectionRange(0, buffer.value.length);
      const setCopyText = (event: ClipboardEvent) => {
        event.clipboardData?.setData("text/plain", buffer.value);
        event.preventDefault();
      };
      document.addEventListener("copy", setCopyText);
      try {
        if (!document.execCommand("copy")) throw Error("COPY_FAILED");
      } finally {
        document.removeEventListener("copy", setCopyText);
        buffer.remove();
        focused?.focus();
      }
      setToast({ message: w.pathCopied });
    } catch {
      setToast({ message: w.copyError, error: true });
    }
  }
  function openProject() {
    setProjectsExpanded(false);
    setProjectOpen(true);
  }
  function sidebar() {
    return (
      <>
        <div className="brand">
          <span className="brand-mark">
            <Icon name="layers" />
          </span>
          <strong>Agenting OS</strong>
          {narrow && (
            <button
              className="icon-button drawer-close"
              title={w.close}
              aria-label={w.close}
              onClick={() => setProjectsExpanded(false)}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className="project-heading">
          <h2 id="projects-title">{w.projects}</h2>
          <button
            className="icon-button"
            disabled={busy}
            aria-label={w.newProject}
            title={w.newProject}
            onClick={openProject}
          >
            <Icon name="plus" />
          </button>
        </div>
        <nav aria-label={w.projects}>
          {snapshot?.projects.map((item) => (
            <button
              className={`project-link ${item.id === projectId ? "selected" : ""}`}
              key={item.id}
              disabled={busy}
              aria-current={item.id === projectId ? "page" : undefined}
              onClick={() => void selectProject(item.id)}
            >
              <span className="project-avatar" aria-hidden="true">
                {item.name
                  .trim()
                  .split(/\s+/)
                  .filter(
                    (_, index, parts) =>
                      index === 0 || index === parts.length - 1,
                  )
                  .map((part) => part.slice(0, 1))
                  .join("")
                  .toLocaleUpperCase(prefs.language)}
              </span>
              <span>{item.name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="local-indicator" aria-hidden="true" />
          {w.local}
          <p>{w.footer}</p>
        </div>
      </>
    );
  }
  if (!api)
    return (
      <main className="standalone">
        <h1>Agenting OS</h1>
        <p>{w.desktopOnly}</p>
      </main>
    );
  return (
    <div className="shell">
      {narrow ? (
        <Modal
          open={projectsExpanded}
          onClose={() => setProjectsExpanded(false)}
          titleId="projects-title"
          className="projects-drawer"
        >
          <div id="project-navigation" className="project-sidebar">
            {sidebar()}
          </div>
        </Modal>
      ) : (
        <aside id="project-navigation" className="project-sidebar">
          {sidebar()}
        </aside>
      )}
      <div className="body">
        <header className="top-bar">
          {narrow && (
            <button
              ref={projectsToggle}
              className="projects-toggle icon-button"
              title={w.projects}
              aria-label={w.projects}
              aria-controls="project-navigation"
              aria-expanded={projectsExpanded}
              onClick={() => setProjectsExpanded(true)}
            >
              <Icon name="menu" />
            </button>
          )}
          <div className="breadcrumb">
            <span>{w.workspace}</span>
            <Icon name="chevron" />
            <strong title={project?.name}>
              {project?.name ?? "Agenting OS"}
            </strong>
          </div>
          <div className="settings">
            <span
              className={`save-status ${error ? "is-error" : ""}`}
              title={error ? w.error : w.saveHint}
            >
              <span
                className={`status-dot ${busy || loading ? "is-pending" : ""}`}
                aria-hidden="true"
              />
              {error
                ? w.saveFailed
                : busy
                  ? w.saving
                  : loading
                    ? w.loading
                    : draft
                      ? w.unsaved
                      : saved
                        ? w.saved
                        : w.local}
            </span>
            <SelectField
              label={w.language}
              value={prefs.language}
              options={[
                { value: "en", label: "English" },
                { value: "pl", label: "Polski" },
              ]}
              disabled={busy || loading || !snapshot}
              onChange={(value) =>
                void preferences({ language: value as Preferences["language"] })
              }
              icon="globe"
              className="language-select"
            />
            <button
              className="icon-button theme-toggle"
              disabled={busy || loading || !snapshot}
              aria-label={w.theme}
              title={prefs.theme === "dark" ? w.light : w.dark}
              onClick={() =>
                void preferences({
                  theme: prefs.theme === "dark" ? "light" : "dark",
                })
              }
            >
              <Icon name={prefs.theme === "dark" ? "sun" : "moon"} />
            </button>
          </div>
        </header>
        <main aria-busy={busy || loading}>
          <div className="workspace-content">
            {error && (
              <div className="error" role="alert">
                <Icon name="info" />
                <span>{w.error}</span>
                <button onClick={() => void refresh()}>{w.retry}</button>
              </div>
            )}
            {!snapshot && !error ? (
              <div className="loading-workspace" aria-label={w.loading}>
                <div className="skeleton-title" />
                <div className="skeleton-composer" />
              </div>
            ) : !project ? (
              <section className="empty">
                <Icon name="layers" />
                <h1>{w.empty}</h1>
                <p>{w.intro}</p>
                <button className="primary" onClick={openProject}>
                  {w.newProject}
                </button>
              </section>
            ) : (
              <>
                <div className="page-title">
                  <div>
                    <h1>{project.name}</h1>
                    {project.root ? (
                      <div className="path-chip">
                        <Icon name="folder" />
                        <code>{project.root}</code>
                        <button
                          className="icon-button copy-path"
                          aria-label={w.copyPath}
                          title={w.copyPath}
                          onClick={() => void copyPath()}
                        >
                          <Icon name="copy" />
                        </button>
                      </div>
                    ) : (
                      <p className="project-scope">
                        <Icon name="folder" />
                        {w.scope}
                      </p>
                    )}
                  </div>
                  <span className="policy badge">
                    <Icon name="shield" />
                    {w.safety}
                  </span>
                </div>
                <nav className="tabs" aria-label={w.work}>
                  {(["tasks", "memory", "agents"] as const).map((item) => (
                    <button
                      key={item}
                      className={tab === item ? "active" : ""}
                      aria-current={tab === item ? "page" : undefined}
                      onClick={() => setTab(item)}
                    >
                      {w[item]}{" "}
                      {item !== "agents" && (
                        <span className="count">
                          {item === "tasks"
                            ? data.tasks.length
                            : data.memory.length}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
                {tab === "tasks" && (
                  <>
                    <section className="composer">
                      <h2>{w.title}</h2>
                      <p className="composer-subtitle">{w.subtitle}</p>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const id = projectId;
                          const title = draft;
                          void mutate(async () => {
                            await api.createTask({
                              projectId: id,
                              title,
                              implementer,
                              reviewer:
                                implementer === "codex" ? "claude" : "codex",
                            });
                            setDrafts((current) => ({ ...current, [id]: "" }));
                            await reloadProject(id);
                          }, w.savedDraft);
                        }}
                      >
                        <label className="sr-only" htmlFor="task-title">
                          {w.taskTitle}
                        </label>
                        <textarea
                          ref={composer}
                          id="task-title"
                          name="title"
                          rows={3}
                          required
                          maxLength={4000}
                          placeholder={w.taskPlaceholder}
                          disabled={busy}
                          value={draft}
                          onChange={(event) => {
                            const title = event.target.value;
                            setDrafts((current) => ({
                              ...current,
                              [projectId]: title,
                            }));
                          }}
                          onKeyDown={(event) => {
                            if (
                              event.key === "Enter" &&
                              (event.ctrlKey || event.metaKey)
                            ) {
                              event.preventDefault();
                              if (draft.trim() && !busy && !loading)
                                event.currentTarget.form?.requestSubmit();
                            }
                          }}
                        />
                        <div className="role-bar">
                          <div className="role-select">
                            <SelectField
                              label={w.implementer}
                              value={implementer}
                              options={agentChoices}
                              onChange={(value) =>
                                setImplementer(value as Agent)
                              }
                              disabled={busy}
                              prefix={w.implementerShort}
                            />
                          </div>
                          <Icon name="swap" className="role-arrow" />
                          <div className="reviewer-role">
                            <span>{w.reviewerShort}</span>
                            <strong>
                              {agentName(
                                implementer === "codex" ? "claude" : "codex",
                              )}
                            </strong>
                          </div>
                          <div className="composer-submit">
                            <kbd title={w.saveShortcut} aria-hidden="true">
                              Ctrl ↵
                            </kbd>
                            <button
                              className="primary"
                              title={w.saveShortcut}
                              disabled={busy || loading || !draft.trim()}
                            >
                              {w.draft}
                            </button>
                          </div>
                        </div>
                        <p className="role-hint" title={w.roleNote}>
                          <Icon name="info" />
                          {w.roleHint}
                        </p>
                      </form>
                    </section>
                    <TaskBoard
                      key={projectId}
                      tasks={data.tasks}
                      memory={data.memory}
                      events={data.events ?? []}
                      language={prefs.language}
                      busy={busy}
                      loading={loading}
                      query={taskQuery}
                      filter={taskFilter}
                      onQuery={setTaskQuery}
                      onFilter={setTaskFilter}
                      onCompose={() => composer.current?.focus()}
                      onRefresh={() =>
                        void mutate(() => reloadProject(projectId))
                      }
                      onAction={taskAction}
                      onRunChanged={()=>void reloadProject(projectId).catch(()=>setError(true))}
                    />
                  </>
                )}
                {tab === "memory" && (
                  <section>
                    <div className="section-heading">
                      <div>
                        <h2>{w.knowledge}</h2>
                        <p>{w.scope}</p>
                      </div>
                      <label className="search-field">
                        <Icon name="search" />
                        <input
                          type="search"
                          aria-label={w.search}
                          placeholder={w.search}
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                        />
                      </label>
                    </div>
                    <form
                      className="memory-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = event.currentTarget,
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
                      <p className="empty-list">
                        {data.memory.length ? w.noMatches : w.noMemory}
                      </p>
                    ) : (
                      <ul className="memories">
                        {visibleMemory.map((memory) => (
                          <li key={memory.id}>
                            <p className="memory-content">{memory.content}</p>
                            <div className="memory-meta">
                              <span>
                                {memory.source} ·{" "}
                                {new Date(memory.createdAt).toLocaleDateString(
                                  prefs.language,
                                )}
                              </span>
                              <button
                                className="cancel-action"
                                disabled={busy}
                                onClick={() => setDeleting(memory)}
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
                    <div className="section-heading">
                      <div>
                        <h2>{w.agents}</h2>
                        <p className="integration-note">{w.integrationNote}</p>
                      </div>
                    </div>
                    <div className="default-master">
                      <span>{w.editRoles}</span>
                      <SelectField
                        label={w.editRoles}
                        value={project.master}
                        options={agentChoices}
                        disabled={busy}
                        onChange={(value) => {
                          const master = value as Agent;
                          void mutate(async () => {
                            await api.setMaster({ projectId, master });
                            const next = await api.snapshot();
                            setSnapshot(next);
                            setImplementer(master);
                          });
                        }}
                      />
                    </div>
                    <div className="integrations">
                      {snapshot?.integrations.map((integration) => (
                        <article key={integration.id}>
                          <div className="integration-title">
                            <h3>{integration.name}</h3>
                            <span className="badge integration-badge">
                              {integration.probe?.installation === "installed"
                                ? w.detected
                                : integration.probe?.installation ===
                                    "not_found"
                                  ? w.notDetected
                                  : w.notConfigured}
                            </span>
                          </div>
                          {integration.probe && (
                            <dl>
                              <div>
                                <dt>{w.probeVersion}</dt>
                                <dd>
                                  {integration.probe.version ?? w.unknown}
                                </dd>
                              </div>
                              <div>
                                <dt>{w.authStatus}</dt>
                                <dd>{w.unknown}</dd>
                              </div>
                              <div>
                                <dt>{w.capabilityStatus}</dt>
                                <dd>
                                  {integration.probe.capabilities.version &&
                                  integration.probe.capabilities.help &&
                                  integration.probe.capabilities.authStatus
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
                    <ProviderSetup language={prefs.language}/>
                  </section>
                )}
              </>
            )}
          </div>
        </main>
      </div>
      <Modal
        open={projectOpen}
        onClose={() => setProjectOpen(false)}
        titleId="project-dialog-title"
        className="project-dialog"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget,
              fd = new FormData(form);
            void mutate(async () => {
              const item = await api.createProject({
                name: String(fd.get("name")),
                root: String(fd.get("root")),
                master: fd.get("master") as Agent,
              });
              const next = await api.snapshot();
              setSnapshot(next);
              setProjectOpen(false);
              await selectProject(item.id);
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
          <label className="field-label" id="master-label">
            {w.editRoles}
          </label>
          <SelectField
            label={w.editRoles}
            name="master"
            value={projectMaster}
            options={agentChoices}
            disabled={busy}
            onChange={(value) => setProjectMaster(value as Agent)}
          />
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
      </Modal>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        titleId="delete-dialog-title"
        className="confirm-dialog"
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
              const memory = deleting;
              void mutate(async () => {
                await api.deleteMemory({
                  projectId: memory.projectId,
                  id: memory.id,
                });
                setDeleting(null);
                await reloadProject(memory.projectId);
              });
            }}
          >
            {w.confirm}
          </button>
        </div>
      </Modal>
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role="status"
        >
          <Icon name={toast.error ? "info" : "check"} />
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label={w.dismiss}
            title={w.dismiss}
            onClick={() => setToast(null)}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
