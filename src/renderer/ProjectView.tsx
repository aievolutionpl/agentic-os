import type {
  Agent,
  GitRepoHealth,
  Memory,
  Preferences,
  Project,
  ProjectData,
  Snapshot,
  Task,
  TaskAction,
} from "../shared";
import { words } from "./i18n";
import {
  Icon,
  SelectField,
} from "./ui";
import { TaskBoard } from "./TaskBoard";
import { ProviderSetup } from "./ProviderSetup";
import { RoutePreview } from "./RoutePreview";
import { ExtensionsPanel } from "./ExtensionsPanel";
import { BrowserPanel } from "./BrowserPanel";
import { OrchestrationPanel } from "./OrchestrationPanel";
import { MasterPanel } from "./MasterPanel";
import { READ_ONLY_AGENTS } from "../shared";
import { type ProjectTab } from "./app-commands";
import { type View } from "./views";


// Rendered only inside the desktop app shell, which returns early without the bridge.
const api = window.agenting!;

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;
export type ChatRequest = { id: string; project?: string; nonce: number; firstTaskAgent?: Agent };

/** Everything the project screen needs from the app shell. */
export interface ProjectViewProps {
  agentChoices: { value: string; label: string }[];
  busy: boolean;
  composer: React.RefObject<HTMLTextAreaElement | null>;
  copyPath: () => void;
  data: ProjectData;
  draft: string;
  gitHealth: GitRepoHealth | null;
  implementer: Agent;
  loading: boolean;
  mutate: (action: () => Promise<unknown>, message?: string) => Promise<boolean>;
  prefs: Preferences;
  project: Project;
  projectId: string;
  projectOpen: boolean;
  projectsExpanded: boolean;
  query: string;
  reloadProject: (id: string) => Promise<void>;
  requestedTask: string | null;
  reviewer: Agent;
  setChatRequest: SetState<ChatRequest | undefined>;
  setDeleting: SetState<Memory | null>;
  setDrafts: SetState<Record<string, string>>;
  setError: SetState<boolean>;
  setImplementer: SetState<Agent>;
  setQuery: SetState<string>;
  setReviewer: SetState<Agent>;
  setSnapshot: SetState<Snapshot | null>;
  setTab: SetState<ProjectTab>;
  setTaskFilter: SetState<string>;
  setTaskQuery: SetState<string>;
  setView: SetState<View>;
  snapshot: Snapshot | null;
  tab: ProjectTab;
  taskAction: (task: Task, action: TaskAction["action"], dependencyIds?: string[]) => Promise<boolean>;
  taskFilter: string;
  taskQuery: string;
  visibleMemory: Memory[];
  w: (typeof words)[Preferences["language"]];
}

/** The project screen: header, Git status, tabs for Master, tasks, memory, agents, extensions and browser. */
export function ProjectView(p: ProjectViewProps) {
  const {
    agentChoices, busy, composer, copyPath, data, draft, gitHealth, implementer, loading, mutate, prefs, project, projectId, projectOpen, projectsExpanded, query, reloadProject, requestedTask, reviewer, setChatRequest, setDeleting, setDrafts, setError, setImplementer, setQuery, setReviewer, setSnapshot, setTab, setTaskFilter, setTaskQuery, setView, snapshot, tab, taskAction, taskFilter, taskQuery, visibleMemory, w,
  } = p;
  return (
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
      {gitHealth?.isGit && (
        <div className="project-harness-bar">
          <div className="project-harness-meta">
            <span>
              GIT BRANCH: <code>{gitHealth.branch}</code>
            </span>
            <span>·</span>
            <span>
              WORKTREE:{" "}
              <code>
                {gitHealth.clean
                  ? prefs.language === "pl"
                    ? "CLEAN (CZYSTE)"
                    : "CLEAN"
                  : prefs.language === "pl"
                    ? `DIRTY (${gitHealth.changedFiles} ZMIAN)`
                    : `DIRTY (${gitHealth.changedFiles} CHANGED)`}
              </code>
            </span>
            {gitHealth.lastCommit && (
              <>
                <span>·</span>
                <span>
                  HEAD: <code>{gitHealth.lastCommit}</code>
                </span>
              </>
            )}
          </div>
        </div>
      )}
      <nav className="tabs" aria-label={w.work}>
        {(
          [
            "master",
            "tasks",
            "memory",
            "agents",
            "extensions",
            "browser",
          ] as const
        )
          .filter((item) => item !== "master" || !!api.missionPlan)
          .map((item) => (
            <button
              key={item}
              className={tab === item ? "active" : ""}
              aria-current={tab === item ? "page" : undefined}
              onClick={() => setTab(item)}
            >
              {item === "master" ? "Master Agent" : w[item]}{" "}
              {(item === "tasks" || item === "memory") && (
                <span className="count">
                  {item === "tasks"
                    ? data.tasks.length
                    : data.memory.length}
                </span>
              )}
            </button>
          ))}
      </nav>
      {tab === "master" && (
        <MasterPanel
          key={`master-${projectId}`}
          project={project}
          memory={data.memory}
          tasks={data.tasks}
          language={prefs.language}
          onChanged={() => {
            void reloadProject(projectId).catch(() => setError(true));
          }}
          onTasks={() => setTab("tasks")}
          onConnections={() => setView("connections")}
          onQuota={() => setView("quota")}
        />
      )}
      {tab === "extensions" && (
        <ExtensionsPanel
          key={projectId}
          projectId={projectId}
          language={prefs.language}
        />
      )}
      {tab === "browser" && (
        <BrowserPanel
          key={projectId}
          projectId={projectId}
          language={prefs.language}
          hidden={projectOpen || projectsExpanded}
        />
      )}
      {tab === "tasks" && (
        <>
          <section className="composer">
            <h2>{w.title}</h2>
            <p className="composer-subtitle">{w.subtitle}</p>
            <div
              className="harness-slash-bar"
              style={{ padding: "0 0 10px" }}
            >
              <span className="harness-slash-label">
                {prefs.language === "pl"
                  ? "Szablony & DAG:"
                  : "Templates & DAG:"}
              </span>
              {[
                {
                  cmd: "/spec",
                  label:
                    prefs.language === "pl"
                      ? "Specyfikacja"
                      : "Specification",
                  text:
                    prefs.language === "pl"
                      ? "Przygotuj szczegółową specyfikację techniczną, kontrakty typów i plan weryfikacji."
                      : "Prepare a detailed technical specification, type contracts, and verification plan.",
                },
                {
                  cmd: "/impl",
                  label:
                    prefs.language === "pl"
                      ? "Implementacja + Testy"
                      : "Implement + Tests",
                  text:
                    prefs.language === "pl"
                      ? "Zaimplementuj zmianę zgodnie z architekturą projektu i dopisz testy jednostkowe."
                      : "Implement the change following project architecture and add unit tests.",
                },
                {
                  cmd: "/security",
                  label: "Security Audit",
                  text:
                    prefs.language === "pl"
                      ? "Przeprowadź audyt bezpieczeństwa granic IPC/API, walidacji danych i zależności."
                      : "Run a security audit of IPC/API boundaries, input validation, and dependencies.",
                },
              ].map((tpl) => (
                <button
                  key={tpl.cmd}
                  type="button"
                  className="slash-chip"
                  disabled={busy}
                  onClick={() =>
                    setDrafts((cur) => ({
                      ...cur,
                      [projectId]: tpl.text,
                    }))
                  }
                >
                  <strong>{tpl.cmd}</strong>
                  <span>{tpl.label}</span>
                </button>
              ))}
              {api.taskAction && (
                <button
                  type="button"
                  className="slash-chip"
                  disabled={busy || loading}
                  onClick={() => {
                    const id = projectId;
                    const rev =
                      reviewer === implementer
                        ? implementer === "codex"
                          ? "claude"
                          : "codex"
                        : reviewer;
                    void mutate(
                      async () => {
                        const t1 = await api.createTask({
                          projectId: id,
                          title:
                            prefs.language === "pl"
                              ? "Etap 1/3 [Spec]: Analiza architektury i specyfikacja zmian"
                              : "Step 1/3 [Spec]: Architecture analysis and change specification",
                          implementer,
                          reviewer: rev,
                        });
                        const t2 = await api.createTask({
                          projectId: id,
                          title:
                            prefs.language === "pl"
                              ? "Etap 2/3 [Kod]: Implementacja funkcjonalności i kontraktów"
                              : "Step 2/3 [Code]: Feature and contract implementation",
                          implementer,
                          reviewer: rev,
                        });
                        await api.taskAction({
                          projectId: id,
                          id: t2.id,
                          action: "dependencies",
                          dependencyIds: [t1.id],
                        });
                        const t3 = await api.createTask({
                          projectId: id,
                          title:
                            prefs.language === "pl"
                              ? "Etap 3/3 [QA]: Testy regresyjne i weryfikacja końcowa"
                              : "Step 3/3 [QA]: Regression tests and final verification",
                          implementer,
                          reviewer: rev,
                        });
                        await api.taskAction({
                          projectId: id,
                          id: t3.id,
                          action: "dependencies",
                          dependencyIds: [t2.id],
                        });
                        await reloadProject(id);
                      },
                      prefs.language === "pl"
                        ? "Utworzono 3-etapowy łańcuch zadań DAG (Spec → Kod → QA)."
                        : "Created 3-step DAG task pipeline (Spec → Code → QA).",
                    );
                  }}
                >
                  <strong>⚡ DAG</strong>
                  <span>
                    {prefs.language === "pl"
                      ? "Pipeline 3 Zadań (Spec→Kod→QA)"
                      : "3-Step Pipeline (Spec→Code→QA)"}
                  </span>
                </button>
              )}
            </div>
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
                    reviewer,
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
                    onChange={(value) => {
                      setImplementer(value as Agent);
                      if (reviewer === value)
                        setReviewer(
                          value === "codex" ? "claude" : "codex",
                        );
                    }}
                    disabled={busy}
                    prefix={w.implementerShort}
                  />
                </div>
                <Icon name="swap" className="role-arrow" />
                <div className="role-select reviewer-select">
                  <SelectField
                    label={w.reviewer}
                    value={reviewer}
                    options={agentChoices.filter(
                      (option) =>
                        option.value !== implementer &&
                        READ_ONLY_AGENTS.includes(
                          option.value as Agent,
                        ),
                    )}
                    onChange={(value) => setReviewer(value as Agent)}
                    disabled={busy}
                    prefix={w.reviewerShort}
                  />
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
              <RoutePreview
                task={draft}
                language={prefs.language}
                disabled={busy}
                current={implementer}
                currentReviewer={reviewer}
                onApply={(chosen, check) => {
                  setImplementer(chosen);
                  setReviewer(check);
                }}
              />
              <p className="role-hint" title={w.roleNote}>
                <Icon name="info" />
                {w.roleHint}
              </p>
            </form>
          </section>
          <OrchestrationPanel
            key={`queue-${projectId}`}
            projectId={projectId}
            tasks={data.tasks}
            memory={data.memory}
            language={prefs.language}
            onChanged={() => {
              void reloadProject(projectId).catch(() =>
                setError(true),
              );
            }}
          />
          <TaskBoard
            key={projectId}
            projectId={projectId}
            requestedTask={requestedTask}
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
            onRunChanged={() =>
              void reloadProject(projectId).catch(() =>
                setError(true),
              )
            }
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
                  scope: fd.get("shared") ? "workspace" : "project",
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
              <label className="dependency-choice">
                <input
                  type="checkbox"
                  name="shared"
                  disabled={busy}
                />
                <span>
                  {prefs.language === "pl"
                    ? "Udostępnij całemu workspace"
                    : "Share across the workspace"}
                </span>
              </label>
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
                  <span className="memory-scope">
                    {memory.scope === "workspace"
                      ? prefs.language === "pl"
                        ? "Wspólna pamięć · wszyscy agenci"
                        : "Shared memory · all agents"
                      : prefs.language === "pl"
                        ? "Pamięć projektu"
                        : "Project memory"}
                  </span>
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
              options={agentChoices.filter((option) =>
                READ_ONLY_AGENTS.includes(option.value as Agent),
              )}
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
          <ProviderSetup language={prefs.language} onFirstTask={agent => { setChatRequest({ id: "", nonce: Date.now(), firstTaskAgent: agent }); setView("chat"); }} />
        </section>
      )}
    </>
  );
}
