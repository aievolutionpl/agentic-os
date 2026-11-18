import type { ChatSession } from "../shared";

/** Pure helpers for the conversation sidebar: search, grouping and templates. */

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLocaleLowerCase();

export interface ChatMatch {
  hit: boolean;
  /** Short excerpt around the first message hit; absent for title hits. */
  snippet?: string;
}

/**
 * Matches every whitespace-separated term (diacritics-insensitive) against the
 * title, agent, repository and message contents. Title hits need no snippet.
 */
export function matchChat(
  chat: ChatSession,
  query: string,
  agentLabel: string = chat.agent,
): ChatMatch {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return { hit: true };
  const head = fold(`${chat.title} ${agentLabel} ${chat.repository ?? ""}`);
  const bodies = chat.messages.map((m) => m.content);
  const all = `${head}\n${fold(bodies.join("\n"))}`;
  if (!terms.every((term) => all.includes(term))) return { hit: false };
  if (terms.every((term) => head.includes(term))) return { hit: true };
  const term = terms.find((t) => !head.includes(t)) ?? terms[0];
  for (const body of bodies) {
    const at = fold(body).indexOf(term);
    if (at < 0) continue;
    const start = Math.max(0, at - 40),
      end = Math.min(body.length, at + term.length + 60);
    const excerpt = body.slice(start, end).replace(/\s+/g, " ").trim();
    return {
      hit: true,
      snippet: `${start > 0 ? "…" : ""}${excerpt}${end < body.length ? "…" : ""}`,
    };
  }
  return { hit: true };
}

export type ChatGroupKey =
  | "pinned"
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "older";

const GROUP_LABELS: Record<ChatGroupKey, [string, string]> = {
  pinned: ["Przypięte", "Pinned"],
  today: ["Dziś", "Today"],
  yesterday: ["Wczoraj", "Yesterday"],
  week: ["Ostatnie 7 dni", "Previous 7 days"],
  month: ["Ostatnie 30 dni", "Previous 30 days"],
  older: ["Starsze", "Older"],
};

export function groupKey(chat: ChatSession, now: number): ChatGroupKey {
  if (chat.pinned) return "pinned";
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const midnight = day.getTime(),
    DAY = 86_400_000;
  if (chat.updatedAt >= midnight) return "today";
  if (chat.updatedAt >= midnight - DAY) return "yesterday";
  if (chat.updatedAt >= midnight - 7 * DAY) return "week";
  if (chat.updatedAt >= midnight - 30 * DAY) return "month";
  return "older";
}

/** Pinned first, then by recency buckets; newest first inside each bucket. */
export function groupChats(
  chats: ChatSession[],
  now: number,
  pl: boolean,
): { key: ChatGroupKey; label: string; items: ChatSession[] }[] {
  const order: ChatGroupKey[] = [
    "pinned",
    "today",
    "yesterday",
    "week",
    "month",
    "older",
  ];
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  return order
    .map((key) => ({
      key,
      label: GROUP_LABELS[key][pl ? 0 : 1],
      items: sorted.filter((chat) => groupKey(chat, now) === key),
    }))
    .filter((group) => group.items.length);
}

/** Inserts a template without discarding what the user already typed. */
export function insertTemplate(current: string, template: string): string {
  const draft = current.trimEnd();
  if (!draft) return template;
  if (draft.includes(template)) return current;
  return `${template}\n\n${draft}`;
}

export const TEMPLATE_LIMIT = 20;
export interface PromptTemplate {
  name: string;
  prompt: string;
}

/** Validates user templates read from local storage; drops anything malformed. */
export function parseTemplates(raw: string | null): PromptTemplate[] {
  try {
    const value: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is PromptTemplate =>
          !!item &&
          typeof item.name === "string" &&
          typeof item.prompt === "string" &&
          !!item.name.trim() &&
          !!item.prompt.trim(),
      )
      .map((item) => ({
        name: item.name.trim().slice(0, 60),
        prompt: item.prompt.slice(0, 12000),
      }))
      .slice(0, TEMPLATE_LIMIT);
  } catch {
    return [];
  }
}

/** Adds or replaces a template by name (case-insensitive), newest first. */
export function upsertTemplate(
  list: PromptTemplate[],
  name: string,
  prompt: string,
): PromptTemplate[] {
  const clean = name.trim().slice(0, 60);
  if (!clean || !prompt.trim()) return list;
  return [
    { name: clean, prompt: prompt.slice(0, 12000) },
    ...list.filter((t) => t.name.toLocaleLowerCase() !== clean.toLocaleLowerCase()),
  ].slice(0, TEMPLATE_LIMIT);
}

/** Lightweight transcript statistics shown in the conversation header. */
export function chatStats(chat: ChatSession) {
  const words = chat.messages.reduce(
    (sum, m) => sum + (m.content.match(/\S+/g)?.length ?? 0),
    0,
  );
  return {
    messages: chat.messages.length,
    words,
    /** ~4 characters per token is a rough, provider-neutral estimate. */
    tokens: Math.round(
      chat.messages.reduce((sum, m) => sum + m.content.length, 0) / 4,
    ),
  };
}
