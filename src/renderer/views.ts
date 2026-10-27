import { attentionWords } from "./Inbox";
import { ccWords } from "./cc-i18n";

/** Every top-level workspace screen. The project view is named after its project. */
export type View =
  | "center"
  | "project"
  | "quota"
  | "connections"
  | "chat"
  | "skills"
  | "schedule"
  | "plugins"
  | "shared-memory"
  | "harness"
  | "inbox"
  | "terminal";

const LABELS: Record<Exclude<View, "project" | "center" | "inbox">, { pl: string; en: string }> = {
  chat: { pl: "Czaty", en: "Chats" },
  terminal: { pl: "Terminal", en: "Terminal" },
  skills: { pl: "Biblioteka skilli", en: "Skill library" },
  "shared-memory": { pl: "Wspólna pamięć", en: "Shared memory" },
  connections: { pl: "Połączenia i modele", en: "Connections & models" },
  quota: { pl: "Limity i tokeny", en: "OpenQuota" },
  plugins: { pl: "Pluginy", en: "Plugins" },
  schedule: { pl: "ScheduleJob", en: "ScheduleJob" },
  harness: { pl: "Harness", en: "Harness" },
};

/** One label per screen, shared by the breadcrumb, window title and command palette. */
export function viewLabel(view: View, language: "pl" | "en"): string | null {
  if (view === "project") return null;
  if (view === "center") return ccWords[language].nav;
  if (view === "inbox") return attentionWords[language].title;
  return LABELS[view][language];
}

/** Alt+digit jumps; the command palette advertises the same keys. */
export const VIEW_SHORTCUTS: Partial<Record<View, string>> = {
  center: "1",
  chat: "2",
  terminal: "3",
  inbox: "4",
  skills: "5",
  "shared-memory": "6",
  connections: "7",
  quota: "8",
  plugins: "9",
  schedule: "0",
};

/** Screens reachable from the sidebar "More" group; it opens while one is active. */
export const SECONDARY_VIEWS: readonly View[] = ["inbox", "terminal", "harness"];

const HISTORY_LIMIT = 30;

/** A visited screen; project screens also remember which project they showed. */
export interface HistoryEntry {
  view: View;
  project?: string;
}

export function historyEntry(view: View, projectId: string): HistoryEntry {
  return view === "project" && projectId ? { view, project: projectId } : { view };
}

const sameEntry = (a: HistoryEntry | undefined, b: HistoryEntry) =>
  !!a && a.view === b.view && a.project === b.project;

/**
 * Back-navigation stack for the in-app view router. Consecutive duplicates are
 * dropped so "back" always lands on a different screen or project.
 */
export function pushHistory(stack: readonly HistoryEntry[], from: HistoryEntry, to: HistoryEntry): HistoryEntry[] {
  // A project screen before any project loaded is not a place to return to.
  if (sameEntry(from, to) || sameEntry(stack[stack.length - 1], from) || (from.view === "project" && !from.project)) return [...stack];
  return [...stack, from].slice(-HISTORY_LIMIT);
}
