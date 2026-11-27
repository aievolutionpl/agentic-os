import type { Attention, AttentionItem, Preferences, ProjectData, Snapshot } from "../shared";
import type { Command } from "./CommandPalette";
import { attentionWords } from "./Inbox";
import { THEME_CHOICES } from "./theme-catalog";
import { agentName } from "./ui";
import { words } from "./i18n";
import { type HistoryEntry, type View, VIEW_SHORTCUTS, viewLabel } from "./views";

export type ProjectTab =
  | "master"
  | "tasks"
  | "memory"
  | "agents"
  | "extensions"
  | "browser";

/** Everything the command palette needs from the app shell. */
export interface CommandContext {
  api: typeof window.agenting;
  prefs: Preferences;
  history: HistoryEntry[];
  snapshot: Snapshot | null;
  project: Snapshot["projects"][number] | undefined;
  data: ProjectData;
  attention: Attention | null;
  w: (typeof words)[Preferences["language"]];
  setView: (view: View) => void;
  setTab: (tab: ProjectTab) => void;
  setRequestedTask: (id: string) => void;
  setQuery: (query: string) => void;
  setToast: (toast: { message: string; error?: boolean }) => void;
  goBack: () => void;
  openAttention: (item: AttentionItem) => void;
  selectProject: (id: string) => Promise<void>;
  openProject: () => void;
  startDemoProject: () => Promise<void>;
  runScan: () => Promise<void>;
  preferences: (patch: Partial<Preferences>) => Promise<void>;
}

/** Builds the command palette entries: navigation, projects, tasks, memory and actions. */
export function buildCommands(c: CommandContext): Command[] {
  const {
    api, prefs, history, snapshot, project, data, attention, w,
    setView, setTab, setRequestedTask, setQuery, setToast, goBack,
    openAttention, selectProject, openProject, startDemoProject, runScan,
    preferences,
  } = c;
  const pl = prefs.language === "pl",
    go = pl ? "Przejdź" : "Go to",
    act = pl ? "Akcja" : "Action",
    projects = pl ? "Projekt" : "Project";
  const views: [View, string, boolean][] = [
    ["center", "grid", !!api?.connectorScan],
    ["chat", "message", !!api?.chatList],
    ["terminal", "terminal", !!api?.terminalList],
    ["inbox", "inbox", !!api?.attention],
    ["skills", "skill", !!api?.chatList],
    ["shared-memory", "memory", !!api?.chatList],
    ["connections", "connections", !!api?.connectorScan],
    ["quota", "tokens", !!api?.connectorScan],
    ["plugins", "connections", !!api?.integrationList],
    ["schedule", "clock", !!api?.scheduleList],
    ["harness", "layers", !!api?.harnessGet],
  ];
  const list: Command[] = views
    .filter(([, , available]) => available)
    .map(([id, icon]) => ({
      id: `view-${id}`,
      label: viewLabel(id, prefs.language)!,
      group: go,
      hint: VIEW_SHORTCUTS[id] ? `${go} · Alt+${VIEW_SHORTCUTS[id]}` : go,
      icon,
      run: () => setView(id),
    }));
  const previous = history[history.length - 1];
  if (previous)
    list.unshift({
      id: "view-back",
      label: `${pl ? "Wstecz" : "Back"}: ${viewLabel(previous.view, prefs.language) ?? snapshot?.projects.find((item) => item.id === previous.project)?.name ?? projects}`,
      group: go,
      hint: `${go} · Alt+←`,
      icon: "back",
      run: goBack,
    });
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
  if (snapshot && project) {
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
    for (const task of data.tasks.slice(0, 30))
      list.push({
        id: `task-${task.id}`,
        label: task.title.split("\n")[0],
        group: pl ? "Zadania" : "Tasks",
        hint: `${project.name} · ${w.statuses[task.status]} · ${agentName(task.implementer)} → ${agentName(task.reviewer)}`,
        icon: "task",
        run: () => {
          setRequestedTask(task.id);
          setView("project");
          setTab("tasks");
        },
      });
    for (const mem of data.memory.slice(0, 20))
      list.push({
        id: `memory-${mem.id}`,
        label: mem.content.split("\n")[0].slice(0, 90),
        group: pl ? "Pamięć" : "Memory",
        hint: `${project.name} · ${mem.source}`,
        icon: "memory",
        run: () => {
          setView("project");
          setTab("memory");
          setQuery(mem.content.split("\n")[0].slice(0, 40));
        },
      });
  }
  list.push(
    {
      id: "action-new-project",
      label: pl ? "Nowy projekt" : "New project",
      group: act,
      icon: "plus",
      run: openProject,
    },
    ...(api?.createDemoProject
      ? [
          {
            id: "action-demo-project",
            label: pl
              ? "Utwórz projekt treningowy (Demo Repo 1-klik)"
              : "Create training project (1-click Demo Repo)",
            group: act,
            icon: "plan",
            run: () => void startDemoProject(),
          },
        ]
      : []),
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
    ...THEME_CHOICES.map(theme => ({id:`action-theme-${theme.value}`,label:`${pl ? "Motyw" : "Theme"}: ${theme.label}`,group:act,icon:"palette",run:()=>void preferences({theme:theme.value})})),
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
