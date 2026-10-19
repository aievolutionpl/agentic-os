import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { exec } from "node:child_process";
import https from "node:https";
import http from "node:http";
import type {
  ProviderQuotaCard,
  QuotaMetric,
  CustomSubscriptionInput,
} from "../shared.js";

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export function formatTimeRemaining(target: string | number | null | undefined): string {
  if (!target) return "Reset unavailable";
  const targetMs =
    typeof target === "number"
      ? target > 1e11
        ? target
        : target * 1000
      : new Date(target).getTime();
  if (isNaN(targetMs)) return "Reset unavailable";
  const diffMs = targetMs - Date.now();
  if (diffMs <= 0) return "Resetting soon";

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `Resets in ${days}d ${hours}h`;
  if (hours > 0) return `Resets in ${hours}h ${minutes}m`;
  return `Resets in ${minutes}m`;
}

function calculateBurnNotice(
  usedPercent: number,
  resetsAt: string | number | null | undefined,
  periodSeconds: number,
): string | null {
  if (usedPercent >= 95) return "🔥 Exhausted";
  if (usedPercent < 50 || !resetsAt) return null;

  const targetMs =
    typeof resetsAt === "number"
      ? resetsAt > 1e11
        ? resetsAt
        : resetsAt * 1000
      : new Date(resetsAt).getTime();
  if (isNaN(targetMs)) return null;

  const remainingFraction = (100 - usedPercent) / 100;
  const timeRemainingSeconds = Math.max(1, (targetMs - Date.now()) / 1000);
  const timeElapsedSeconds = Math.max(1, periodSeconds - timeRemainingSeconds);
  const ratePerSecond = (usedPercent / 100) / timeElapsedSeconds;

  if (ratePerSecond > 0) {
    const secondsToDepletion = remainingFraction / ratePerSecond;
    if (secondsToDepletion < timeRemainingSeconds) {
      const minutes = Math.floor(secondsToDepletion / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      if (days > 0) return `🔥 Limit in ${days}d ${hours % 24}h`;
      if (hours > 0) return `🔥 Limit in ${hours}h ${minutes % 60}m`;
      return `🔥 Limit in ${minutes}m`;
    }
  }

  if (usedPercent >= 75) {
    const approxSec = Math.floor(timeRemainingSeconds * (remainingFraction / (usedPercent / 100)));
    const minutes = Math.max(1, Math.floor(approxSec / 60));
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `🔥 Limit in ${hours}h ${minutes % 60}m`;
    return `🔥 Limit in ${minutes}m`;
  }

  return null;
}

function sampleTrend(points: number, seed: number): number[] {
  const result: number[] = [];
  let current = Math.abs(Math.sin(seed)) * 40;
  for (let i = 0; i < points; i++) {
    const delta = Math.sin(seed + i * 0.7) * 35 + (Math.cos(seed * 2 + i) * 20);
    current = Math.max(4, Math.min(100, Math.round(current + delta)));
    result.push(current);
  }
  return result;
}

/* ========================================================================= */
/* CLAUDE QUOTA                                                              */
/* ========================================================================= */
async function fetchClaudeLive(): Promise<ProviderQuotaCard | null> {
  const credPath = join(homedir(), ".claude", ".credentials.json");
  if (!existsSync(credPath)) return null;

  try {
    const content = JSON.parse(readFileSync(credPath, "utf8"));
    const oauth = content.claudeAiOauth || content.claude_ai_oauth;
    const token = oauth?.accessToken || oauth?.access_token;
    if (!token) return null;

    const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = https.request(
        "https://api.anthropic.com/api/oauth/usage",
        {
          method: "GET",
          agent: httpsAgent,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "anthropic-beta": "oauth-2025-04-20",
            "User-Agent": "claude-code/2.1.69",
          },
          timeout: 10000,
        },
        (response) => {
          let data = "";
          response.on("data", (chunk) => (data += chunk));
          response.on("end", () => {
            try {
              resolve({ status: response.statusCode || 0, body: JSON.parse(data) });
            } catch (err) {
              reject(err);
            }
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout"));
      });
      req.end();
    });

    if (res.status !== 200 || !res.body) return null;
    const body = res.body;

    const metrics: QuotaMetric[] = [];

    // 1. Session (5-hour window)
    if (body.five_hour) {
      const used = Math.round(body.five_hour.utilization || 0);
      const remaining = Math.max(0, 100 - used);
      const resetAt = body.five_hour.resets_at;
      metrics.push({
        id: "session",
        label: "Session",
        usedPercent: used,
        remainingPercent: remaining,
        resetsAt: resetAt,
        resetNotice: formatTimeRemaining(resetAt),
        burnNotice: calculateBurnNotice(used, resetAt, 5 * 3600),
        periodSeconds: 5 * 3600,
        format: "percent",
        usedValue: used,
        limitValue: 100,
        unit: "%",
      });
    }

    // 2. Weekly (7-day window)
    if (body.seven_day) {
      const used = Math.round(body.seven_day.utilization || 0);
      const remaining = Math.max(0, 100 - used);
      const resetAt = body.seven_day.resets_at;
      metrics.push({
        id: "weekly",
        label: "Weekly",
        usedPercent: used,
        remainingPercent: remaining,
        resetsAt: resetAt,
        resetNotice: formatTimeRemaining(resetAt),
        burnNotice: calculateBurnNotice(used, resetAt, 7 * 86400),
        periodSeconds: 7 * 86400,
        format: "percent",
        usedValue: used,
        limitValue: 100,
        unit: "%",
      });
    }

    // 3. Extra Usage
    const extra = body.extra_usage;
    if (extra && extra.is_enabled && extra.monthly_limit) {
      const used = extra.used_credits || 0;
      const limit = extra.monthly_limit || 100;
      const usedPct = Math.min(100, Math.round((used / limit) * 100));
      metrics.push({
        id: "extra",
        label: "Extra Usage",
        usedPercent: usedPct,
        remainingPercent: 100 - usedPct,
        resetsAt: null,
        resetNotice: "Reset unavailable",
        burnNotice: null,
        periodSeconds: 30 * 86400,
        format: "usd",
        usedValue: used,
        limitValue: limit,
        unit: extra.currency || "USD",
      });
    } else {
      metrics.push({
        id: "extra",
        label: "Extra Usage",
        usedPercent: 0,
        remainingPercent: 100,
        resetsAt: null,
        resetNotice: "Reset unavailable",
        burnNotice: null,
        periodSeconds: 30 * 86400,
        format: "percent",
        usedValue: null,
        limitValue: null,
        unit: null,
      });
    }

    const planType = (oauth?.subscriptionType || "Pro").toUpperCase();
    const planFormatted = planType.startsWith("PRO") ? "Pro" : planType.startsWith("MAX") ? "Max" : planType;

    return {
      id: "claude",
      name: "Claude",
      plan: planFormatted,
      account: null,
      icon: "claude",
      status: metrics.some((m) => m.burnNotice) ? "warning" : "active",
      metrics,
      usageTrend: sampleTrend(24, 42),
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/* ========================================================================= */
/* CODEX QUOTA                                                               */
/* ========================================================================= */
async function fetchCodexLive(): Promise<ProviderQuotaCard | null> {
  const authPath = join(homedir(), ".codex", "auth.json");
  if (!existsSync(authPath)) return null;

  try {
    const auth = JSON.parse(readFileSync(authPath, "utf8"));
    const token = auth?.tokens?.access_token;
    const accountId = auth?.tokens?.account_id || "";
    if (!token) return null;

    const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "OpenQuota/1.0.0",
      };
      if (accountId) headers["ChatGPT-Account-Id"] = accountId;

      const req = https.request(
        "https://chatgpt.com/backend-api/wham/usage",
        {
          method: "GET",
          agent: httpsAgent,
          headers,
          timeout: 10000,
        },
        (response) => {
          let data = "";
          response.on("data", (chunk) => (data += chunk));
          response.on("end", () => {
            try {
              resolve({ status: response.statusCode || 0, body: JSON.parse(data) });
            } catch (err) {
              reject(err);
            }
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout"));
      });
      req.end();
    });

    if (res.status !== 200 || !res.body) return null;
    const body = res.body;

    const metrics: QuotaMetric[] = [];
    const rateLimit = body.rate_limit || {};
    const primary = rateLimit.primary_window;
    const secondary = rateLimit.secondary_window;

    // 1. Session Window (if available)
    if (secondary) {
      const used = Math.round(secondary.used_percent || 0);
      const remaining = Math.max(0, 100 - used);
      const resetAt = secondary.reset_at ? new Date(secondary.reset_at * 1000).toISOString() : null;
      metrics.push({
        id: "session",
        label: "Session",
        usedPercent: used,
        remainingPercent: remaining,
        resetsAt: resetAt,
        resetNotice: formatTimeRemaining(resetAt),
        burnNotice: calculateBurnNotice(used, resetAt, secondary.limit_window_seconds || 5 * 3600),
        periodSeconds: secondary.limit_window_seconds || 5 * 3600,
        format: "percent",
        usedValue: used,
        limitValue: 100,
        unit: "%",
      });
    } else {
      metrics.push({
        id: "session",
        label: "Session",
        usedPercent: 0,
        remainingPercent: 100,
        resetsAt: null,
        resetNotice: "Reset unavailable",
        burnNotice: null,
        periodSeconds: 5 * 3600,
        format: "percent",
        usedValue: null,
        limitValue: null,
        unit: null,
      });
    }

    // 2. Weekly Window
    if (primary) {
      const used = Math.round(primary.used_percent || 0);
      const remaining = Math.max(0, 100 - used);
      const resetAt = primary.reset_at ? new Date(primary.reset_at * 1000).toISOString() : null;
      metrics.push({
        id: "weekly",
        label: "Weekly",
        usedPercent: used,
        remainingPercent: remaining,
        resetsAt: resetAt,
        resetNotice: formatTimeRemaining(resetAt),
        burnNotice: calculateBurnNotice(used, resetAt, primary.limit_window_seconds || 7 * 86400),
        periodSeconds: primary.limit_window_seconds || 7 * 86400,
        format: "percent",
        usedValue: used,
        limitValue: 100,
        unit: "%",
      });
    }

    let plan = "Pro 5x";
    if (body.plan_type) {
      if (body.plan_type === "prolite") plan = "Pro 5x";
      else if (body.plan_type === "pro") plan = "Pro";
      else plan = body.plan_type.charAt(0).toUpperCase() + body.plan_type.slice(1);
    }

    return {
      id: "codex",
      name: "Codex",
      plan,
      account: body.email || null,
      icon: "codex",
      status: metrics.some((m) => m.burnNotice) ? "warning" : "active",
      metrics,
      usageTrend: sampleTrend(24, 88),
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/* ========================================================================= */
/* ANTIGRAVITY QUOTA                                                         */
/* ========================================================================= */
interface LanguageServerInfo {
  port: number;
  csrf: string;
}

function findAntigravityServer(): Promise<LanguageServerInfo | null> {
  return new Promise((resolve) => {
    const psScript = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$proc = Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'language_server|^agy(\\.exe)?$' } | Select-Object -First 1
if (-not $proc) { exit }
$pidVal = $proc.ProcessId
$cmd = $proc.CommandLine
$csrf = ''
if ($cmd -match '--csrf_token\\s+([0-9a-fA-F-]+)') {
    $csrf = $Matches[1]
}
$conn = Get-NetTCPConnection -OwningProcess $pidVal -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort
ConvertTo-Json -Compress -InputObject @{ ports=@($conn); csrf=$csrf }
    `;

    exec(
      `powershell -NoLogo -NoProfile -NonInteractive -Command "${psScript.replace(/\r?\n/g, " ")}"`,
      { timeout: 4000 },
      (err, stdout) => {
        if (err || !stdout.trim()) return resolve(null);
        try {
          const parsed = JSON.parse(stdout);
          const ports = Array.isArray(parsed.ports) ? parsed.ports : [parsed.ports];
          const csrf = parsed.csrf || "";
          if (ports.length > 0 && csrf) {
            // port with higher number or 52418
            const preferredPort = ports.find((p: number) => p % 2 === 0) || ports[0];
            return resolve({ port: preferredPort, csrf });
          }
          resolve(null);
        } catch {
          resolve(null);
        }
      },
    );
  });
}

async function fetchAntigravityLive(): Promise<ProviderQuotaCard | null> {
  try {
    const server = await findAntigravityServer();
    if (!server) {
      // Fallback: If IDE is active with default quota
      return {
        id: "antigravity",
        name: "Antigravity",
        plan: "Pro",
        account: null,
        icon: "antigravity",
        status: "active",
        metrics: [
          {
            id: "session",
            label: "Session",
            usedPercent: 0,
            remainingPercent: 100,
            resetsAt: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
            resetNotice: "Not started",
            burnNotice: null,
            periodSeconds: 5 * 3600,
            format: "percent",
            usedValue: 0,
            limitValue: 100,
            unit: "%",
          },
          {
            id: "weekly",
            label: "Weekly",
            usedPercent: 0,
            remainingPercent: 100,
            resetsAt: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
            resetNotice: "Resets in 6d 23h",
            burnNotice: null,
            periodSeconds: 7 * 86400,
            format: "percent",
            usedValue: 0,
            limitValue: 100,
            unit: "%",
          },
        ],
        usageTrend: sampleTrend(24, 15),
        updatedAt: new Date().toISOString(),
      };
    }

    const payload = JSON.stringify({
      metadata: {
        ideName: "antigravity",
        extensionName: "antigravity",
        ideVersion: "2.24.0",
        locale: "en",
      },
    });

    const responseData = await new Promise<any>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: server.port,
          path: "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Connect-Protocol-Version": "1",
            "x-codeium-csrf-token": server.csrf,
            "Content-Length": Buffer.byteLength(payload),
          },
          timeout: 4000,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout"));
      });
      req.write(payload);
      req.end();
    });

    const metrics: QuotaMetric[] = [];
    const groups = responseData?.response?.groups || [];

    for (const group of groups) {
      const buckets = group.buckets || [];
      for (const bucket of buckets) {
        const id = bucket.bucketId;
        const remainingFraction = typeof bucket.remainingFraction === "number" ? bucket.remainingFraction : 1.0;
        const remainingPercent = Math.max(0, Math.min(100, Math.round(remainingFraction * 100)));
        const usedPercent = 100 - remainingPercent;
        const resetTime = bucket.resetTime || null;

        if (id === "gemini-5h") {
          metrics.push({
            id: "session",
            label: "Session",
            usedPercent,
            remainingPercent,
            resetsAt: resetTime,
            resetNotice: remainingPercent === 100 ? "Not started" : formatTimeRemaining(resetTime),
            burnNotice: calculateBurnNotice(usedPercent, resetTime, 5 * 3600),
            periodSeconds: 5 * 3600,
            format: "percent",
            usedValue: usedPercent,
            limitValue: 100,
            unit: "%",
          });
        } else if (id === "gemini-weekly") {
          metrics.push({
            id: "weekly",
            label: "Weekly",
            usedPercent,
            remainingPercent,
            resetsAt: resetTime,
            resetNotice: formatTimeRemaining(resetTime),
            burnNotice: calculateBurnNotice(usedPercent, resetTime, 7 * 86400),
            periodSeconds: 7 * 86400,
            format: "percent",
            usedValue: usedPercent,
            limitValue: 100,
            unit: "%",
          });
        } else if (id === "3p-5h") {
          metrics.push({
            id: "claude-session",
            label: "Claude Pool",
            usedPercent,
            remainingPercent,
            resetsAt: resetTime,
            resetNotice: remainingPercent === 100 ? "Not started" : formatTimeRemaining(resetTime),
            burnNotice: calculateBurnNotice(usedPercent, resetTime, 5 * 3600),
            periodSeconds: 5 * 3600,
            format: "percent",
            usedValue: usedPercent,
            limitValue: 100,
            unit: "%",
          });
        }
      }
    }

    return {
      id: "antigravity",
      name: "Antigravity",
      plan: "Pro",
      account: null,
      icon: "antigravity",
      status: metrics.some((m) => m.burnNotice) ? "warning" : "active",
      metrics: metrics.length > 0 ? metrics : [
        {
          id: "session",
          label: "Session",
          usedPercent: 0,
          remainingPercent: 100,
          resetsAt: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
          resetNotice: "Not started",
          burnNotice: null,
          periodSeconds: 5 * 3600,
          format: "percent",
          usedValue: 0,
          limitValue: 100,
          unit: "%",
        },
        {
          id: "weekly",
          label: "Weekly",
          usedPercent: 0,
          remainingPercent: 100,
          resetsAt: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
          resetNotice: "Resets in 6d 23h",
          burnNotice: null,
          periodSeconds: 7 * 86400,
          format: "percent",
          usedValue: 0,
          limitValue: 100,
          unit: "%",
        },
      ],
      usageTrend: sampleTrend(24, 15),
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/* ========================================================================= */
/* CUSTOM SUBSCRIPTIONS STORAGE                                              */
/* ========================================================================= */
function getCustomSubscriptionsPath(userDataPath: string): string {
  return join(userDataPath, "quota_subscriptions.json");
}

export function loadCustomSubscriptions(userDataPath: string): CustomSubscriptionInput[] {
  const filePath = getCustomSubscriptionsPath(userDataPath);
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomSubscription(
  userDataPath: string,
  input: CustomSubscriptionInput,
): ProviderQuotaCard {
  const filePath = getCustomSubscriptionsPath(userDataPath);
  mkdirSync(userDataPath, { recursive: true });
  const items = loadCustomSubscriptions(userDataPath);
  const id = input.id || `custom-${Date.now()}`;
  const record: CustomSubscriptionInput = {
    ...input,
    id,
    tokensUsed: Number(input.tokensUsed) || 0,
    tokenLimit: Math.max(1, Number(input.tokenLimit) || 1000000),
  };

  const existingIdx = items.findIndex((i) => i.id === id);
  if (existingIdx >= 0) {
    items[existingIdx] = record;
  } else {
    items.push(record);
  }
  writeFileSync(filePath, JSON.stringify(items, null, 2), "utf8");

  return mapCustomToCard(record);
}

export function deleteCustomSubscription(userDataPath: string, id: string): void {
  const filePath = getCustomSubscriptionsPath(userDataPath);
  if (!existsSync(filePath)) return;
  const items = loadCustomSubscriptions(userDataPath).filter((i) => i.id !== id);
  writeFileSync(filePath, JSON.stringify(items, null, 2), "utf8");
}

function mapCustomToCard(sub: CustomSubscriptionInput): ProviderQuotaCard {
  const used = Math.min(sub.tokensUsed, sub.tokenLimit);
  const usedPercent = Math.min(100, Math.round((used / sub.tokenLimit) * 100));
  const remainingPercent = 100 - usedPercent;
  const resetsAt = sub.resetAt || new Date(Date.now() + 7 * 86400 * 1000).toISOString();
  const periodSeconds =
    sub.period === "session"
      ? 5 * 3600
      : sub.period === "daily"
        ? 86400
        : sub.period === "weekly"
          ? 7 * 86400
          : 30 * 86400;

  return {
    id: sub.id!,
    name: sub.name,
    plan: sub.plan,
    account: null,
    icon: sub.provider,
    status: remainingPercent <= 10 ? "warning" : "active",
    metrics: [
      {
        id: "tokens",
        label: sub.period === "weekly" ? "Weekly Tokens" : sub.period === "session" ? "Session" : "Token Budget",
        usedPercent,
        remainingPercent,
        resetsAt,
        resetNotice: formatTimeRemaining(resetsAt),
        burnNotice: calculateBurnNotice(usedPercent, resetsAt, periodSeconds),
        periodSeconds,
        format: "tokens",
        usedValue: sub.tokensUsed,
        limitValue: sub.tokenLimit,
        unit: "tokens",
      },
    ],
    usageTrend: sampleTrend(24, (sub.name.charCodeAt(0) || 10) * 3),
    isCustom: true,
    updatedAt: new Date().toISOString(),
  };
}

/* ========================================================================= */
/* SCAN ALL QUOTAS                                                           */
/* ========================================================================= */
export async function scanAllQuotas(userDataPath: string): Promise<ProviderQuotaCard[]> {
  const [claudeCard, codexCard, antigravityCard] = await Promise.all([
    fetchClaudeLive().catch(() => null),
    fetchCodexLive().catch(() => null),
    fetchAntigravityLive().catch(() => null),
  ]);

  const cards: ProviderQuotaCard[] = [];

  // Claude
  if (claudeCard) {
    cards.push(claudeCard);
  } else {
    cards.push({
      id: "claude",
      name: "Claude",
      plan: "Not detected",
      account: null,
      icon: "claude",
      status: "not_configured",
      metrics: [
        {
          id: "session",
          label: "Session",
          usedPercent: 0,
          remainingPercent: 100,
          resetsAt: null,
          resetNotice: "Sign in with `claude`",
          burnNotice: null,
          periodSeconds: 5 * 3600,
          format: "percent",
          usedValue: null,
          limitValue: null,
          unit: null,
        },
      ],
      usageTrend: [],
      updatedAt: new Date().toISOString(),
    });
  }

  // Codex
  if (codexCard) {
    cards.push(codexCard);
  } else {
    cards.push({
      id: "codex",
      name: "Codex",
      plan: "Not detected",
      account: null,
      icon: "codex",
      status: "not_configured",
      metrics: [
        {
          id: "weekly",
          label: "Weekly",
          usedPercent: 0,
          remainingPercent: 100,
          resetsAt: null,
          resetNotice: "Sign in with `codex`",
          burnNotice: null,
          periodSeconds: 7 * 86400,
          format: "percent",
          usedValue: null,
          limitValue: null,
          unit: null,
        },
      ],
      usageTrend: [],
      updatedAt: new Date().toISOString(),
    });
  }

  // Antigravity
  if (antigravityCard) {
    cards.push(antigravityCard);
  } else {
    cards.push({
      id: "antigravity",
      name: "Antigravity",
      plan: "Pro",
      account: null,
      icon: "antigravity",
      status: "active",
      metrics: [
        {
          id: "session",
          label: "Session",
          usedPercent: 0,
          remainingPercent: 100,
          resetsAt: null,
          resetNotice: "Not started",
          burnNotice: null,
          periodSeconds: 5 * 3600,
          format: "percent",
          usedValue: 0,
          limitValue: 100,
          unit: "%",
        },
        {
          id: "weekly",
          label: "Weekly",
          usedPercent: 0,
          remainingPercent: 100,
          resetsAt: null,
          resetNotice: "Resets in 7d",
          burnNotice: null,
          periodSeconds: 7 * 86400,
          format: "percent",
          usedValue: 0,
          limitValue: 100,
          unit: "%",
        },
      ],
      usageTrend: sampleTrend(24, 15),
      updatedAt: new Date().toISOString(),
    });
  }

  // Custom subscriptions
  const customSubs = loadCustomSubscriptions(userDataPath);
  for (const sub of customSubs) {
    cards.push(mapCustomToCard(sub));
  }

  return cards;
}
