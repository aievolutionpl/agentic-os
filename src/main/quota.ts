import {
  localDay,
  readObservations,
  type ProviderObservations,
} from "./observations.js";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ProviderQuotaCard,
  QuotaMetric,
  CustomSubscriptionInput,
} from "../shared.js";
import { exact, text } from "./validate.js";
import type {
  AntigravityReading,
  BridgeReadings,
  ClaudeReading,
} from "./limit-bridge.js";

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const date = (v: unknown): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(typeof v === "number" ? v * 1000 : v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
export function formatTimeRemaining(
  target: string | number | null | undefined,
): string {
  const at = date(target);
  if (!at) return "Reset unavailable";
  const minutes = Math.max(0, Math.ceil((Date.parse(at) - Date.now()) / 60000));
  return minutes >= 1440
    ? `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function unavailable(
  id: string,
  name: string,
  detail: string,
): ProviderQuotaCard {
  return {
    id,
    name,
    icon: id,
    plan: "—",
    account: null,
    status: "not_configured",
    metrics: [],
    usageTrend: [],
    source: "unavailable",
    detail,
    updatedAt: new Date().toISOString(),
  };
}
function status(metrics: QuotaMetric[]): ProviderQuotaCard["status"] {
  const known = metrics.filter(
    (m) => m.usedValue !== null && m.limitValue !== null,
  );
  return known.some((m) => m.usedValue! >= m.limitValue!)
    ? "exhausted"
    : known.some((m) => m.usedPercent >= 90)
      ? "warning"
      : "active";
}
/** Percent windows are not token allowances. Keep all reported buckets and their actual duration. */
export function codexQuota(
  response: any,
  account?: any,
  usage?: any,
): ProviderQuotaCard {
  const buckets =
    response?.rateLimitsByLimitId &&
    typeof response.rateLimitsByLimitId === "object"
      ? Object.entries(response.rateLimitsByLimitId)
      : [["codex", response?.rateLimits]];
  const metrics: QuotaMetric[] = [];
  for (const [id, raw] of buckets.slice(0, 20)) {
    const bucket = raw as any;
    for (const key of ["primary", "secondary"]) {
      const window = bucket?.[key];
      if (
        !finite(window?.usedPercent) ||
        !finite(window?.windowDurationMins) ||
        window.windowDurationMins <= 0
      )
        continue;
      const used = window.usedPercent;
      metrics.push({
        id: `${id}-${key}`,
        label: `${String(bucket?.limitName ?? id).slice(0, 80)} · ${window.windowDurationMins / 60}h`,
        usedPercent: Math.min(100, used),
        remainingPercent: Math.max(0, 100 - used),
        resetsAt: date(window.resetsAt),
        periodSeconds: window.windowDurationMins * 60,
        format: "percent",
        usedValue: used,
        limitValue: 100,
        unit: "%",
      });
    }
  }
  if (!metrics.length)
    return unavailable("codex", "Codex", "CODEX_LIMITS_UNAVAILABLE");
  const daily = Array.isArray(usage?.dailyUsageBuckets)
    ? usage.dailyUsageBuckets
        .filter((d: any) => finite(d.tokens) && date(d.startDate))
        .slice(-30)
    : [];
  return {
    id: "codex",
    name: "Codex",
    icon: "codex",
    plan:
      typeof account?.account?.planType === "string"
        ? account.account.planType.slice(0, 80)
        : "ChatGPT",
    account: null,
    status: status(metrics),
    metrics,
    usageTrend: daily.map((d: any) => d.tokens),
    trendLabels: daily.map((d: any) => d.startDate),
    source: "codex-app-server",
    updatedAt: new Date().toISOString(),
  };
}
/**
 * OpenRouter account and key spend. `credits` (GET /credits) gives the
 * account balance; `response` (GET /key) the key's own limit and its daily,
 * weekly and monthly spend. A missing credits reading leaves the balance out.
 */
export function openRouterQuota(
  response: any,
  credits?: any,
): ProviderQuotaCard {
  const d = response?.data;
  if (!d || !finite(d.usage))
    return unavailable(
      "openrouter",
      "OpenRouter",
      "OPENROUTER_RESPONSE_INVALID",
    );
  const metrics: QuotaMetric[] = [];
  const add = (
    id: string,
    label: string,
    used: unknown,
    limit: unknown,
    reset: unknown,
  ) => {
    if (!finite(used)) return;
    const cap = finite(limit) ? limit : null;
    metrics.push({
      id,
      label,
      usedValue: used,
      limitValue: cap,
      usedPercent:
        cap === null ? 0 : cap === 0 ? 100 : Math.min(100, (used / cap) * 100),
      remainingPercent:
        cap === null
          ? 0
          : cap === 0
            ? 0
            : Math.max(0, 100 - (used / cap) * 100),
      resetsAt: date(reset),
      periodSeconds: 0,
      format: "usd",
      unit: "USD",
    });
  };
  const total = credits?.data?.total_credits,
    spent = credits?.data?.total_usage;
  const balanceUsd =
    finite(total) && finite(spent)
      ? Math.max(0, Math.round((total - spent) * 100) / 100)
      : null;
  if (balanceUsd !== null)
    add("balance", "Account balance", spent, total, null);
  // limit_remaining is authoritative for resetting keys; lifetime usage is not window spend.
  if (
    finite(d.limit) &&
    typeof d.limit_remaining === "number" &&
    Number.isFinite(d.limit_remaining)
  )
    add(
      "key",
      "API key",
      Math.max(0, d.limit - d.limit_remaining),
      d.limit,
      null,
    );
  else if (balanceUsd === null)
    add("usage", "Lifetime usage", d.usage, null, null);
  add("today", "Spend today", d.usage_daily, null, null);
  add("week", "Spend this week", d.usage_weekly, null, null);
  add("month", "Spend this month", d.usage_monthly, null, null);
  if (Array.isArray(d.budgets))
    for (const [i, b] of d.budgets.slice(0, 10).entries())
      add(
        `budget-${i}`,
        String(b.scope ?? "Budget").slice(0, 80),
        b.spend_usd,
        b.limit_usd,
        b.resets_at,
      );
  return {
    id: "openrouter",
    name: "OpenRouter",
    icon: "openrouter",
    plan: "API",
    account: null,
    // The balance is display-only: a management key may belong to another
    // account than the inference key, and /credits names no account. Only
    // the inference key's own limits judge whether OpenCode can run.
    status: status(metrics.filter((m) => m.id !== "balance")),
    metrics,
    usageTrend: [],
    source: "openrouter-api",
    detail:
      balanceUsd === null
        ? "API_KEY_BUDGET_NOT_ACCOUNT_BALANCE"
        : "OPENROUTER_ACCOUNT_BALANCE",
    balanceUsd,
    updatedAt: new Date().toISOString(),
  };
}

/** An agent whose model calls are billed to the connected OpenRouter account. */
export function viaOpenRouter(
  id: string,
  name: string,
  router: ProviderQuotaCard,
  detail = "BILLED_VIA_OPENROUTER",
): ProviderQuotaCard {
  return {
    ...router,
    id,
    name,
    icon: id,
    plan: "OpenRouter",
    detail,
    via: "openrouter",
  };
}

const CLAUDE_WINDOWS: Record<string, [string, number]> = {
  five_hour: ["Session · 5 h", 18000],
  seven_day: ["Weekly · 7 d", 604800],
  seven_day_opus: ["Weekly · Opus", 604800],
  seven_day_sonnet: ["Weekly · Sonnet", 604800],
  spend_limit: ["Spend limit", 0],
};

/** Claude Code's own status line windows; a window past its reset is dropped. */
export function claudeLimitMetrics(
  reading: ClaudeReading,
  now = Date.now(),
): QuotaMetric[] {
  return Object.entries(reading.windows)
    .filter(([, w]) => w.resetsAt > now)
    .map(([id, w]): QuotaMetric => {
      const used = Math.min(100, w.usedPercent);
      const [label, periodSeconds] = CLAUDE_WINDOWS[id] ?? [
        id.replace(/_/g, " "),
        0,
      ];
      return {
        id: `limit-${id}`,
        label,
        usedPercent: used,
        remainingPercent: 100 - used,
        usedValue: used,
        limitValue: 100,
        resetsAt: new Date(w.resetsAt).toISOString(),
        periodSeconds,
        format: "percent",
        unit: "%",
      };
    });
}

/** Antigravity's shared quota pools ("gemini-weekly", ...), as fractions left. */
export function antigravityLimitMetrics(
  reading: AntigravityReading,
  now = Date.now(),
): QuotaMetric[] {
  return Object.entries(reading.buckets)
    .filter(([, b]) => b.resetsAt === null || b.resetsAt > now)
    .map(([id, b]): QuotaMetric => {
      const used = Math.round((1 - b.remainingFraction) * 1000) / 10;
      const words = id.split(/[-_:.]/).filter(Boolean);
      const label = words
        .map((w, i) => (i ? w : w[0]!.toUpperCase() + w.slice(1)))
        .join(" · ");
      return {
        id: `pool-${id}`,
        label,
        usedPercent: used,
        remainingPercent: 100 - used,
        usedValue: used,
        limitValue: 100,
        resetsAt:
          b.resetsAt === null ? null : new Date(b.resetsAt).toISOString(),
        periodSeconds: /week/i.test(id) ? 604800 : /day/i.test(id) ? 86400 : 0,
        format: "percent",
        unit: "%",
      };
    });
}

/** A CLI card whose limits came from its own status line. */
function statusLineCard(
  base: ProviderQuotaCard,
  limits: QuotaMetric[],
  at: number,
  plan: string | null,
): ProviderQuotaCard {
  if (!limits.length) return base;
  const metrics = [
    ...limits,
    ...base.metrics.filter((m) => m.id === "tokens-today"),
  ];
  return {
    ...base,
    plan: plan ?? base.plan,
    metrics,
    status: status(limits),
    source: "cli-statusline",
    detail: `${base.id.toUpperCase()}_LIMITS_FROM_STATUS_LINE`,
    updatedAt: new Date(at).toISOString(),
  };
}
function validateCustom(
  input: unknown,
  legacy = false,
): CustomSubscriptionInput {
  const p = legacy
    ? (input as Record<string, unknown>)
    : exact(input, [
        "id",
        "name",
        "provider",
        "plan",
        "tokenLimit",
        "tokensUsed",
        "period",
        "resetAt",
      ]);
  if (
    !p ||
    !finite(p.tokenLimit) ||
    p.tokenLimit <= 0 ||
    !Number.isSafeInteger(p.tokenLimit) ||
    !finite(p.tokensUsed) ||
    !Number.isSafeInteger(p.tokensUsed)
  )
    throw Error("INVALID_BUDGET");
  if (!["session", "daily", "weekly", "monthly"].includes(String(p.period)))
    throw Error("INVALID_PERIOD");
  if (p.resetAt && !date(p.resetAt)) throw Error("INVALID_RESET");
  const id = p.id === undefined ? `custom-${randomUUID()}` : text(p.id, 100);
  if (!/^custom-[A-Za-z0-9-]+$/.test(id)) throw Error("INVALID_ID");
  return {
    id,
    name: text(p.name, 100),
    provider: text(p.provider, 100),
    plan: text(p.plan, 100),
    tokenLimit: p.tokenLimit,
    tokensUsed: p.tokensUsed,
    period: p.period as CustomSubscriptionInput["period"],
    resetAt: date(p.resetAt),
  };
}
const file = (directory: string) => join(directory, "quota_subscriptions.json");
function persist(directory: string, items: CustomSubscriptionInput[]) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(file(directory) + ".tmp", JSON.stringify(items, null, 2), {
    mode: 0o600,
  });
  renameSync(file(directory) + ".tmp", file(directory));
}
export function loadCustomSubscriptions(
  directory: string,
): CustomSubscriptionInput[] {
  if (!existsSync(file(directory))) return [];
  const parsed = JSON.parse(readFileSync(file(directory), "utf8"));
  if (!Array.isArray(parsed) || parsed.length > 100)
    throw Error("INVALID_SUBSCRIPTIONS");
  const items = parsed.map((p) => validateCustom(p, true));
  // Migrate legacy records: the old schema accepted plaintext apiKey. Never return or retain that field.
  if (parsed.some((p) => Object.hasOwn(p, "apiKey"))) persist(directory, items);
  return items;
}
export function saveCustomSubscription(
  directory: string,
  input: unknown,
): ProviderQuotaCard {
  const record = validateCustom(input),
    items = loadCustomSubscriptions(directory);
  const index = items.findIndex((i) => i.id === record.id);
  if (index >= 0) items[index] = record;
  else {
    if (items.length >= 100) throw Error("SUBSCRIPTION_LIMIT");
    items.push(record);
  }
  persist(directory, items);
  return mapCustomToCard(record);
}
export function deleteCustomSubscription(directory: string, id: unknown) {
  const value = text(id, 100);
  if (!/^custom-[A-Za-z0-9-]+$/.test(value)) throw Error("INVALID_ID");
  persist(
    directory,
    loadCustomSubscriptions(directory).filter((s) => s.id !== value),
  );
}
function mapCustomToCard(sub: CustomSubscriptionInput): ProviderQuotaCard {
  const pct = Math.min(100, (sub.tokensUsed / sub.tokenLimit) * 100);
  const metrics: QuotaMetric[] = [
    {
      id: "tokens",
      label: sub.period,
      usedPercent: pct,
      remainingPercent: 100 - pct,
      usedValue: sub.tokensUsed,
      limitValue: sub.tokenLimit,
      resetsAt: sub.resetAt ?? null,
      periodSeconds: {
        session: 18000,
        daily: 86400,
        weekly: 604800,
        monthly: 2592000,
      }[sub.period],
      format: "tokens",
      unit: "tokens",
    },
  ];
  return {
    id: sub.id!,
    name: sub.name,
    icon: sub.provider,
    plan: sub.plan,
    account: null,
    metrics,
    status: status(metrics),
    usageTrend: [],
    source: "manual",
    isCustom: true,
    updatedAt: new Date().toISOString(),
  };
}
const WINDOWS: Record<string, [string, number]> = {
  five_hour: ["5 h", 18000],
  seven_day: ["7 d", 604800],
  seven_day_opus: ["7 d · Opus", 604800],
  seven_day_sonnet: ["7 d · Sonnet", 604800],
};

/**
 * A card built only from what the provider's own CLI reported during real runs:
 * rate-limit windows (with utilization when the CLI includes it) and token counts.
 * Nothing is estimated; an expired window is dropped instead of shown as current.
 */
export function observedQuota(
  id: string,
  name: string,
  observed: ProviderObservations | undefined,
  plan: string | null,
  emptyDetail: string,
  now = Date.now(),
): ProviderQuotaCard {
  if (!observed)
    return { ...unavailable(id, name, emptyDetail), plan: plan ?? "—" };
  const limits = Object.entries(observed.limits).filter(
    ([, l]) => l.resetsAt === null || l.resetsAt > now,
  );
  const metrics: QuotaMetric[] = limits
    .map(([window, l]): QuotaMetric => {
      const [label, periodSeconds] = WINDOWS[window] ?? [window, 0];
      const used =
        l.utilization === null ? null : Math.round(l.utilization * 100);
      return {
        id: `limit-${window}`,
        label,
        usedPercent: used ?? 0,
        remainingPercent: used === null ? 0 : 100 - used,
        usedValue: used,
        limitValue: used === null ? null : 100,
        resetsAt:
          l.resetsAt === null ? null : new Date(l.resetsAt).toISOString(),
        periodSeconds,
        format: "percent",
        state: l.status,
      };
    })
    // Windows with a reported percentage lead the card's gauge.
    .sort(
      (a, b) => Number(b.usedValue !== null) - Number(a.usedValue !== null),
    );
  const days = Object.keys(observed.tokens).sort().slice(-7);
  const today = localDay(now);
  metrics.push({
    id: "tokens-today",
    label: "Tokens today · Agenting OS",
    usedPercent: 0,
    remainingPercent: 0,
    usedValue: observed.tokens[today] ?? 0,
    limitValue: null,
    resetsAt: null,
    periodSeconds: 86400,
    format: "tokens",
    unit: "tokens",
  });
  const statuses = limits.map(([, l]) => l.status);
  return {
    id,
    name,
    icon: id,
    plan: plan ?? "—",
    account: null,
    metrics,
    status: statuses.includes("rejected")
      ? "exhausted"
      : statuses.includes("allowed_warning") ||
          metrics.some(
            (m) =>
              m.usedValue !== null && m.limitValue === 100 && m.usedValue >= 90,
          )
        ? "warning"
        : "active",
    usageTrend: days.map((d) => observed.tokens[d] ?? 0),
    trendLabels: days,
    source: "cli-stream",
    detail: limits.length
      ? `${id.toUpperCase()}_LIMITS_FROM_RUNS`
      : `${id.toUpperCase()}_TOKENS_FROM_RUNS`,
    updatedAt: new Date(observed.updatedAt).toISOString(),
  };
}

export interface QuotaSources {
  codex?: () => Promise<ProviderQuotaCard>;
  openrouter?: () => Promise<ProviderQuotaCard>;
  /** Subscription tier as the Claude CLI's own auth status reports it. */
  claudePlan?: () => Promise<string | null>;
  /** Quota the CLIs' own status lines handed over (opt-in link). */
  statusLines?: () => BridgeReadings;
  /** Agents whose model calls are billed to the connected OpenRouter key. */
  viaOpenRouter?: () => string[];
  /** Agents on an OpenRouter model with their own key: shown for reference. */
  ownOpenRouterKey?: () => string[];
}
export async function scanAllQuotas(
  directory: string,
  sources: QuotaSources = {},
): Promise<ProviderQuotaCard[]> {
  const observed = readObservations(directory);
  const [codex, router, claudePlan] = await Promise.all([
    sources
      .codex?.()
      .catch(() => unavailable("codex", "Codex", "CODEX_LIMITS_UNAVAILABLE")),
    sources
      .openrouter?.()
      .catch(() =>
        unavailable("openrouter", "OpenRouter", "OPENROUTER_UNAVAILABLE"),
      ),
    sources.claudePlan?.().catch(() => null) ?? null,
  ]);
  const lines = (() => {
    try {
      return sources.statusLines?.() ?? {};
    } catch {
      return {};
    }
  })();
  const routerCard =
    router ?? unavailable("openrouter", "OpenRouter", "CONFIGURE_OPENROUTER");
  const routed = new Set(sources.viaOpenRouter?.() ?? []),
    reference = new Set(sources.ownOpenRouterKey?.() ?? []);
  const billed = (id: string, name: string) =>
    routerCard.source !== "openrouter-api"
      ? unavailable(id, name, "PROVIDER_USAGE_UNAVAILABLE")
      : routed.has(id)
        ? viaOpenRouter(id, name, routerCard)
        : reference.has(id)
          ? // Not counted for this agent's gate or budget: it may bill
            // another account. The card names whose balance it is.
            {
              ...viaOpenRouter(id, name, routerCard, "OWN_OPENROUTER_KEY"),
              status: "active" as const,
            }
          : unavailable(id, name, "PROVIDER_USAGE_UNAVAILABLE");
  const claude = observedQuota(
    "claude",
    "Claude Code",
    observed.claude,
    claudePlan ?? null,
    "CLAUDE_USE_OFFICIAL_USAGE",
  );
  const antigravity = observedQuota(
    "antigravity",
    "Antigravity",
    observed.antigravity,
    null,
    "ANTIGRAVITY_USE_OFFICIAL_USAGE",
  );
  return [
    codex ?? unavailable("codex", "Codex", "CONFIGURE_CODEX"),
    lines.claude
      ? statusLineCard(
          claude,
          claudeLimitMetrics(lines.claude),
          lines.claude.at,
          claudePlan ?? null,
        )
      : claude,
    unavailable("gemini", "Gemini CLI", "GEMINI_USE_OFFICIAL_USAGE"),
    billed("opencode", "OpenCode"),
    billed("hermes", "Hermes"),
    unavailable("local", "Local LLM", "LOCAL_MODEL_NO_SUBSCRIPTION_QUOTA"),
    routerCard,
    lines.antigravity
      ? statusLineCard(
          antigravity,
          antigravityLimitMetrics(lines.antigravity),
          lines.antigravity.at,
          lines.antigravity.plan,
        )
      : antigravity,
    ...loadCustomSubscriptions(directory).map(mapCustomToCard),
  ];
}
