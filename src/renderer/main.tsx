import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  Agent,
  Attention,
  AttentionItem,
  ConnectorScan,
  Memory,
  Preferences,
  ProjectData,
  ProviderSetting,
  Snapshot,
  Task,
  TaskAction,
} from "../shared";
import { words } from "./i18n";
import {
  agentName,
  connectionLabel,
  connectionState,
  Icon,
  Modal,
  SelectField,
  useNarrow,
} from "./ui";
import { ProviderIcon } from "./ProviderIcon";
import { TaskBoard } from "./TaskBoard";
import { ProviderSetup } from "./ProviderSetup";
import { ExtensionsPanel } from "./ExtensionsPanel";
import { BrowserPanel } from "./BrowserPanel";
import { ControlCenter } from "./ControlCenter";
import { Inbox, attentionWords } from "./Inbox";
import { CommandPalette, type Command } from "./CommandPalette";
import { OpenQuotaPanel } from "./OpenQuotaPanel";
import { OrchestrationPanel } from "./OrchestrationPanel";
import { MasterPanel } from "./MasterPanel";
import { ChatWorkspace, startNewChat } from "./ChatWorkspace";
import { MemoryHub, SkillsHub } from "./KnowledgeHub";
import { READ_ONLY_AGENTS } from "../shared";
import { ccWords } from "./cc-i18n";
import "./style.css";
import "./harness.css";

const api = window.agenting;
const agentChoices = [
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude Code" },
  { value: "opencode", label: "OpenCode / OpenRouter" },
  { value: "gemini", label: "Gemini CLI" },
  { value: "hermes", label: "Hermes" },
  { value: "local", label: "Lokalny LLM" },
  { value: "antigravity", label: "Antigravity" },
];
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [projectId, setProjectId] = useState("");
  const [data, setData] = useState<ProjectData>({
    tasks: [],
    memory: [],
    events: [],
  });
  const [tab, setTab] = useState<
    "master" | "tasks" | "memory" | "agents" | "extensions" | "browser"
  >(api?.missionPlan ? "master" : "tasks");
  const [view, setView] = useState<
    | "center"
    | "project"
    | "quota"
    | "connections"
    | "chat"
    | "skills"
    | "shared-memory"
    | "inbox"
  >(api?.chatList ? "chat" : api?.connectorScan ? "center" : "project");
  const [attention, setAttention] = useState<Attention | null>(null),
    [attentionFailed, setAttentionFailed] = useState(false),
    [palette, setPalette] = useState(false);
  // Connection evidence for the sidebar agent dock; refreshed on every view
  // change so a check run on any screen shows up everywhere.
  const [agents, setAgents] = useState<ProviderSetting[]>([]);
  useEffect(() => {
    const load = () =>
      void api
        ?.providerSettings?.()
        .then(setAgents)
        .catch(() => {});
    load();
    // Checks that finish while Connections stays open refresh the dock too.
    window.addEventListener("agenting:evidence", load);
    return () => window.removeEventListener("agenting:evidence", load);
  }, [view]);
  const [scan, setScan] = useState<ConnectorScan | null>(null),
    [scanning, setScanning] = useState(false),
    [scanFailed, setScanFailed] = useState(false);
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
    [reviewer, setReviewer] = useState<Agent>("claude"),
    [projectMaster, setProjectMaster] = useState<Agent>("codex");
  const [query, setQuery] = useState(""),
    [taskQuery, setTaskQuery] = useState(""),
    [taskFilter, setTaskFilter] = useState("all");
  const [memoryResults, setMemoryResults] = useState<{
    projectId: string;
    query: string;
    rows: Memory[];
  } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({}),
    [projectsExpanded, setProjectsExpanded] = useState(false);
  const selection = useRef(""),
    contentPane = useRef<HTMLElement>(null),
    projectsToggle = useRef<HTMLButtonElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    pendingFocus = useRef<HTMLElement | null>(null);
  const narrow = useNarrow();
  useEffect(() => {
    if (contentPane.current) contentPane.current.scrollTop = 0;
  }, [view, projectId, tab]);
  const prefs = snapshot?.preferences ?? { language: "pl", theme: "dark" },
    w = words[prefs.language];
  const project = snapshot?.projects.find(
    (project) => project.id === projectId,
  );
  const visibleMemory =
    memoryResults?.projectId === projectId && memoryResults.query === query
      ? memoryResults.rows
      : data.memory.filter((memory) =>
          (memory.content + " " + memory.source)
            .toLocaleLowerCase(prefs.language)
            .includes(query.toLocaleLowerCase(prefs.language)),
        );
  const draft = drafts[projectId] ?? "";
  useEffect(() => {
    setMemoryResults(null);
    if (tab !== "memory" || !query.trim() || !api?.memorySearch) return;
    let active = true;
    const timer = setTimeout(() => {
      void api
        .memorySearch({ projectId, query })
        .then((rows) => {
          if (active) setMemoryResults({ projectId, query, rows });
        })
        .catch(() => {
          if (active) setError(true);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [projectId, query, tab, data.memory]);
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
  async function readAttention() {
    if (!api?.attention) return;
    try {
      setAttention(await api.attention());
      setAttentionFailed(false);
    } catch {
      setAttentionFailed(true);
    }
  }
  useEffect(() => {
    if (!api?.attention) return;
    void readAttention();
    const timer = setInterval(() => void readAttention(), 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (view === "inbox" || view === "center") void readAttention();
  }, [view]);
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "k" ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey
      )
        return;
      if (document.querySelector("dialog[open]:not(.command-palette)")) return;
      event.preventDefault();
      setPalette((value) => !value);
    };
    document.addEventListener("keydown", open);
    return () => document.removeEventListener("keydown", open);
  }, []);
  function openAttention(item: AttentionItem) {
    setProjectsExpanded(false);
    setView("project");
    setTab(item.target);
    void selectProject(item.projectId);
  }
  async function runScan() {
    if (!api?.connectorScan || scanning) return;
    setScanning(true);
    setScanFailed(false);
    try {
      setScan(await api.connectorScan());
    } catch {
      setScanFailed(true);
    } finally {
      setScanning(false);
    }
  }
  // Connection evidence changes (a check on another screen) rescan Control
  // Center, so its counts and map never lag behind the Connections cards.
  const evidence = agents
    .map((a) => `${a.id}:${a.configured}:${a.lastCheck?.observedAt ?? ""}`)
    .join("|");
  const scannedEvidence = useRef("");
  useEffect(() => {
    if (view !== "center" || scanning) return;
    const changed =
      !!scan &&
      !!scannedEvidence.current &&
      evidence !== scannedEvidence.current;
    // The first evidence load only records a baseline; it is not a change.
    if (evidence) scannedEvidence.current = evidence;
    if ((!scan && !scanFailed) || changed) void runScan();
  }, [view, evidence]);
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
  function commands(): Command[] {
    const pl = prefs.language === "pl",
      go = pl ? "Przejdź" : "Go to",
      act = pl ? "Akcja" : "Action",
      projects = pl ? "Projekt" : "Project";
    const views: [typeof view, string, string, string, boolean][] = [
      ["chat", "message", "Czaty", "Chats", !!api?.chatList],
      [
        "inbox",
        "inbox",
        attentionWords.pl.title,
        attentionWords.en.title,
        !!api?.attention,
      ],
      ["center", "grid", ccWords.pl.nav, ccWords.en.nav, !!api?.connectorScan],
      [
        "connections",
        "connections",
        "Połączenia i modele",
        "Connections & models",
        !!api?.connectorScan,
      ],
      ["quota", "layers", "Limity i tokeny", "OpenQuota", !!api?.connectorScan],
      [
        "shared-memory",
        "memory",
        "Wspólna pamięć",
        "Shared memory",
        !!api?.chatList,
      ],
      [
        "skills",
        "skill",
        "Biblioteka skilli",
        "Skill library",
        !!api?.chatList,
      ],
    ];
    const list: Command[] = views
      .filter((v) => v[4])
      .map(([id, icon, plLabel, enLabel]) => ({
        id: `view-${id}`,
        label: pl ? plLabel : enLabel,
        group: go,
        icon,
        run: () => setView(id),
      }));
    for (const item of attention?.decisions.slice(0, 8) ?? [])
      list.push({
        id: `attention-${item.kind}-${item.id}`,
        label: `${attentionWords[prefs.language].kinds[item.kind]}: ${item.title}`,
        group: attentionWords[prefs.language].title,
        hint: item.projectName,
        icon: "inbox",
        run: () => openAttention(item),
      });
    for (const item of snapshot?.projects ?? [])
      list.push({
        id: `project-${item.id}`,
        label: item.name,
        group: projects,
        hint: `${projects} · ${item.root || (pl ? "bez folderu" : "no folder")}`,
        icon: "folder",
        run: () => {
          setView("project");
          void selectProject(item.id);
        },
      });
    if (snapshot && project)
      for (const t of [
        ["master", "plan", "Master Agent", "Master Agent"],
        ["tasks", "task", "Zadania", "Tasks"],
        ["memory", "memory", "Pamięć projektu", "Project memory"],
      ] as const)
        list.push({
          id: `tab-${t[0]}`,
          label: `${project.name}: ${pl ? t[2] : t[3]}`,
          group: projects,
          icon: t[1],
          run: () => {
            setView("project");
            setTab(t[0]);
          },
        });
    list.push(
      {
        id: "action-new-project",
        label: pl ? "Nowy projekt" : "New project",
        group: act,
        icon: "plus",
        run: openProject,
      },
      ...(api?.backupCreate
        ? [
            {
              id: "action-backup",
              label: pl ? "Utwórz kopię zapasową danych" : "Back up data",
              group: act,
              icon: "download",
              run: () =>
                void api.backupCreate!()
                  .then((s) => {
                    if (s)
                      setToast({
                        message: pl
                          ? `Zapisano kopię: ${s.file}`
                          : `Backup saved: ${s.file}`,
                      });
                  })
                  .catch(() =>
                    setToast({
                      message: pl
                        ? "Nie udało się zapisać kopii."
                        : "Could not save the backup.",
                      error: true,
                    }),
                  ),
            },
            {
              id: "action-data",
              label: pl
                ? "Przywróć z kopii lub eksportuj diagnostykę"
                : "Restore a backup or export diagnostics",
              group: act,
              icon: "history",
              run: () => {
                setView("center");
                setTimeout(
                  () =>
                    document
                      .getElementById("data-title")
                      ?.scrollIntoView({ block: "start" }),
                  50,
                );
              },
            },
          ]
        : []),
      {
        id: "action-rescan",
        label: pl ? "Skanuj połączenia agentów" : "Rescan agent connections",
        group: act,
        icon: "refresh",
        run: () => {
          setView("center");
          void runScan();
        },
      },
      {
        id: "action-theme",
        label:
          prefs.theme === "dark"
            ? pl
              ? "Jasny motyw"
              : "Light theme"
            : pl
              ? "Ciemny motyw"
              : "Dark theme",
        group: act,
        icon: prefs.theme === "dark" ? "sun" : "moon",
        run: () =>
          void preferences({
            theme: prefs.theme === "dark" ? "light" : "dark",
          }),
      },
      {
        id: "action-language",
        label: pl ? "Switch to English" : "Przełącz na polski",
        group: act,
        icon: "globe",
        run: () => void preferences({ language: pl ? "en" : "pl" }),
      },
    );
    return list;
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
          <div>
            <strong>Agenting OS</strong>
            <small className="brand-byline">AI EVOLUTION POLSKA</small>
          </div>
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
        {api?.connectorScan && (
          <nav className="primary-nav" aria-label="Agenting OS">
            {api.chatList &&
              (
                [
                  { id: "chat", icon: "message", pl: "Czaty", en: "Chats" },
                  {
                    id: "shared-memory",
                    icon: "memory",
                    pl: "Wspólna pamięć",
                    en: "Shared memory",
                  },
                  {
                    id: "skills",
                    icon: "skill",
                    pl: "Biblioteka skilli",
                    en: "Skill library",
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${view === item.id ? "selected" : ""}`}
                  aria-current={view === item.id ? "page" : undefined}
                  onClick={() => {
                    setProjectsExpanded(false);
                    setView(item.id);
                  }}
                >
                  <Icon name={item.icon} />
                  <span>{prefs.language === "pl" ? item.pl : item.en}</span>
                </button>
              ))}
            {api.attention && (
              <button
                className={`nav-item ${view === "inbox" ? "selected" : ""}`}
                aria-current={view === "inbox" ? "page" : undefined}
                onClick={() => {
                  setProjectsExpanded(false);
                  setView("inbox");
                }}
              >
                <Icon name="inbox" />
                <span>{attentionWords[prefs.language].title}</span>
                {!!attention?.decisions.length && (
                  <span
                    className="nav-count"
                    aria-label={
                      prefs.language === "pl"
                        ? `${attention.decisions.length} oczekuje`
                        : `${attention.decisions.length} waiting`
                    }
                  >
                    {attention.decisions.length > 99
                      ? "99+"
                      : attention.decisions.length}
                  </span>
                )}
              </button>
            )}
            <button
              className={`nav-item ${view === "connections" ? "selected" : ""}`}
              aria-current={view === "connections" ? "page" : undefined}
              onClick={() => {
                setProjectsExpanded(false);
                setView("connections");
              }}
            >
              <Icon name="connections" />
              <span>
                {prefs.language === "pl"
                  ? "Połączenia i modele"
                  : "Connections & models"}
              </span>
            </button>
            <button
              className={`nav-item ${view === "quota" ? "selected" : ""}`}
              aria-current={view === "quota" ? "page" : undefined}
              onClick={() => {
                setProjectsExpanded(false);
                setView("quota");
              }}
            >
              <Icon name="layers" />
              <span>
                {prefs.language === "pl" ? "Limity i tokeny" : "OpenQuota"}
              </span>
            </button>
            <button
              className={`nav-item ${view === "center" ? "selected" : ""}`}
              aria-current={view === "center" ? "page" : undefined}
              onClick={() => {
                setProjectsExpanded(false);
                setView("center");
              }}
            >
              <Icon name="grid" />
              <span>{ccWords[prefs.language].nav}</span>
            </button>
          </nav>
        )}
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
              className={`project-link ${item.id === projectId && view === "project" ? "selected" : ""}`}
              key={item.id}
              disabled={busy}
              aria-current={
                item.id === projectId && view === "project" ? "page" : undefined
              }
              onClick={() => {
                setView("project");
                void selectProject(item.id);
              }}
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
        <div
          className="agent-dock"
          role="group"
          aria-label={prefs.language === "pl" ? "Twoi agenci" : "Your agents"}
        >
          {agents.some((a) => a.configured) ? (
            agents
              .filter((a) => a.configured)
              .map((a) => {
                const state = connectionState(a),
                  label = `${agentName(a.id)} · ${connectionLabel(state, prefs.language === "pl")}`;
                return (
                  <button
                    key={a.id}
                    className={`state-${state}`}
                    title={label}
                    aria-label={label}
                    onClick={() => {
                      setProjectsExpanded(false);
                      setView("connections");
                    }}
                  >
                    <span className="picker-glyph">
                      <ProviderIcon provider={a.id} />
                      <i className="connection-dot" aria-hidden="true" />
                    </span>
                  </button>
                );
              })
          ) : (
            <button
              className="agent-dock-empty"
              onClick={() => {
                setProjectsExpanded(false);
                setView("connections");
              }}
            >
              <Icon name="connections" />
              {prefs.language === "pl" ? "Podłącz agenta" : "Connect an agent"}
            </button>
          )}
        </div>
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
            <strong title={view === "center" ? undefined : project?.name}>
              {view === "chat"
                ? prefs.language === "pl"
                  ? "Czaty"
                  : "Chats"
                : view === "skills"
                  ? prefs.language === "pl"
                    ? "Biblioteka skilli"
                    : "Skill library"
                  : view === "shared-memory"
                    ? prefs.language === "pl"
                      ? "Wspólna pamięć"
                      : "Shared memory"
                    : view === "inbox"
                      ? attentionWords[prefs.language].title
                      : view === "center"
                        ? ccWords[prefs.language].nav
                        : view === "quota"
                          ? prefs.language === "pl"
                            ? "Limity i tokeny"
                            : "OpenQuota"
                          : view === "connections"
                            ? prefs.language === "pl"
                              ? "Połączenia i modele"
                              : "Connections & models"
                            : (project?.name ?? "Agenting OS")}
            </strong>
          </div>
          <div className="settings">
            <button
              className="palette-trigger"
              aria-keyshortcuts="Control+K Meta+K"
              onClick={() => setPalette(true)}
            >
              <Icon name="search" />
              <span>{prefs.language === "pl" ? "Szukaj" : "Search"}</span>
              <kbd>Ctrl K</kbd>
            </button>
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
        <main ref={contentPane} aria-busy={busy || loading}>
          <div className="workspace-content">
            {error && (
              <div className="error" role="alert">
                <Icon name="info" />
                <span>{w.error}</span>
                <button onClick={() => void refresh()}>{w.retry}</button>
              </div>
            )}
            {view === "chat" ? (
              <ChatWorkspace
                language={prefs.language}
                projects={snapshot?.projects ?? []}
                onConfigure={() => setView("connections")}
                onProjectsChanged={() => void refresh()}
                onTask={(id) => {
                  setView("project");
                  setTab("tasks");
                  void selectProject(id);
                }}
              />
            ) : view === "skills" ? (
              <SkillsHub
                language={prefs.language}
                projects={snapshot?.projects ?? []}
                onChat={() => setView("chat")}
              />
            ) : view === "shared-memory" ? (
              <MemoryHub
                language={prefs.language}
                projects={snapshot?.projects ?? []}
                onNewProject={openProject}
              />
            ) : view === "inbox" ? (
              <Inbox
                language={prefs.language}
                attention={attention}
                failed={attentionFailed}
                onRefresh={() => void readAttention()}
                onOpen={openAttention}
                onStart={(target) => {
                  if (target === "project") return openProject();
                  if (target === "chat") startNewChat();
                  setView(target);
                }}
              />
            ) : view === "connections" ? (
              <ProviderSetup language={prefs.language} />
            ) : view === "quota" ? (
              <OpenQuotaPanel
                language={prefs.language}
                onConfigure={() => setView("connections")}
              />
            ) : view === "center" ? (
              <ControlCenter
                language={prefs.language}
                scan={scan}
                scanning={scanning}
                failed={scanFailed}
                onRescan={() => void runScan()}
                onOpenQuota={() => setView("quota")}
                onConfigure={() => setView("connections")}
                onNewProject={openProject}
                projectCount={snapshot?.projects.length ?? 0}
                work={attention}
                onOpenInbox={() => setView("inbox")}
                onOpenAttention={openAttention}
                agents={agents}
              />
            ) : !snapshot && !error ? (
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
                    <ProviderSetup language={prefs.language} />
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
              setView("project");
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
          {api.chooseRepository && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                void api
                  .chooseRepository()
                  .then((path) => {
                    const field = document.querySelector<HTMLInputElement>(
                      '.project-dialog input[name="root"]',
                    );
                    if (path && field) field.value = path;
                  })
                  .catch(() => setError(true));
              }}
            >
              {prefs.language === "pl"
                ? "Wybierz repozytorium Git"
                : "Browse Git repository"}
            </button>
          )}
          <label className="field-label" id="master-label">
            {w.editRoles}
          </label>
          <SelectField
            label={w.editRoles}
            name="master"
            value={projectMaster}
            options={agentChoices.filter((option) =>
              READ_ONLY_AGENTS.includes(option.value as Agent),
            )}
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
      {palette && (
        <CommandPalette
          open={palette}
          onClose={() => setPalette(false)}
          commands={commands()}
          language={prefs.language}
        />
      )}
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
