export const AGENTS = [
  "codex",
  "claude",
  "gemini",
  "hermes",
  "opencode",
  "local",
  "antigravity",
] as const;
export type Agent = (typeof AGENTS)[number];
export interface ProviderInstallPlan {
  agent: Agent; command: string; url: string; platform: string;
  missing: string[]; ready: boolean; executable: string | null;
}
/** Gemini remains readable in historical records; new work uses Antigravity. */
export const AVAILABLE_AGENTS = AGENTS.filter((id) => id !== "gemini");
export const READ_ONLY_AGENTS: readonly Agent[] = [
  "codex",
  "claude",
  "gemini",
  "opencode",
  "local",
];
export interface HarnessSettings {
  instructions: string;
  autoRecall: boolean;
  recallLimit: number;
  revision: number;
  updatedAt: string | null;
}
export type HarnessSettingsInput = Omit<HarnessSettings, "updatedAt">;
export interface ContextManifestEntry {
  id: string;
  kind: "harness" | "workflow" | "memory" | "skill";
  reason: "required" | "pinned" | "selected" | "recalled";
  label: string;
  source: string;
  characters: number;
  truncated: boolean;
}
export interface ContextPreview {
  body: string;
  characters: number;
  limit: number;
  readOnly: boolean;
  memoryIds: string[];
  workflow: string;
  manifest?: ContextManifestEntry[];
  fingerprint?: string;
  harnessRevision?: number;
  recallSkipped?: number;
}
export interface LocalModelSetting {
  configured: boolean;
  baseURL: string;
  model: string;
}
export interface LocalModelDiscovery {
  reachable: boolean;
  baseURL: string;
  provider: "ollama" | "lmstudio" | "openai-local";
  models: string[];
  latencyMs: number;
  observedAt: string;
}
export interface LocalModelPingResult {
  ok: boolean;
  model: string;
  latencyMs: number;
  detail: string;
  observedAt: string;
}
export interface VerificationCheck {
  id: string;
  name: string;
  status: "passed" | "warning" | "failed";
  detail: string;
  durationMs: number;
}
export interface VerificationReport {
  runId: string;
  passed: boolean;
  checks: VerificationCheck[];
  observedAt: string;
  durationMs: number;
}
export interface GitHubIssueItem {
  number: number;
  title: string;
  body: string;
  url: string;
  labels: string[];
}
export interface GitRepoHealth {
  isGit: boolean;
  branch: string | null;
  clean: boolean;
  changedFiles: number;
  lastCommit: string | null;
  observedAt: string;
}
export interface MissionStep {
  key: string;
  title: string;
  acceptance: string;
  implementer: Agent;
  reviewer: Agent;
  dependsOn: string[];
  workflow: "implementation" | "research";
  taskId: string | null;
}
export interface Mission {
  id: string;
  projectId: string;
  goal: string;
  master: Agent;
  workers: Agent[];
  status:
    | "planning"
    | "ready"
    | "running"
    | "evaluating"
    | "blocked"
    | "completed"
    | "needs_changes"
    | "failed"
    | "stopped"
    | "interrupted";
  summary: string;
  steps: MissionStep[];
  contextIds: string[];
  skillIds: string[];
  runId: string | null;
  reason: string | null;
  evaluation: {
    verdict: "complete" | "needs_changes";
    summary: string;
    nextSteps: string;
  } | null;
  events: { at: number; message: string }[];
  createdAt: number;
  updatedAt: number;
}
export interface Project {
  id: string;
  name: string;
  root: string;
  master: Agent;
  createdAt: string;
}
export interface Task {
  id: string;
  projectId: string;
  title: string;
  implementer: Agent;
  reviewer: Agent;
  status: "draft" | "queued" | "running" | "completed" | "failed" | "cancelled";
  attempt: number;
  owner: string | null;
  expiresAt: number | null;
  heartbeatAt: number | null;
  failure: FailureCode | null;
  dependencies: string[];
  blockedBy: string[];
  ready: boolean;
  /** Completed, but its latest run's result still waits for review or
   * approval, so dependents cannot run yet. */
  awaitingApproval: boolean;
  createdAt: string;
}
export type FailureCode =
  | "worker_error"
  | "validation_failed"
  | "lease_expired";
export interface TaskEvent {
  seq: number;
  projectId: string;
  taskId: string;
  attempt: number;
  actor: string;
  at: string;
  kind:
    | "created"
    | "imported"
    | "dependencies"
    | "queued"
    | "claimed"
    | "heartbeat"
    | "failed"
    | "retried"
    | "revision"
    | "completed"
    | "cancelled";
  failure: FailureCode | null;
  details: string | null;
}
export interface TaskAction {
  projectId: string;
  id: string;
  action: "queue" | "retry" | "cancel" | "dependencies";
  dependencyIds?: string[];
}
export interface Memory {
  id: string;
  projectId: string;
  content: string;
  source: string;
  createdAt: string;
  scope?: "project" | "workspace";
  pinned?: number;
  updatedAt?: string | null;
}
export interface MemoryGraph {
  nodes: {
    id: string;
    label: string;
    kind: "project" | "memory" | "agent";
    active?: boolean;
    projectId: string;
    memoryId?: string;
    path?: string;
    fileType?: "folder" | "markdown";
    content: string;
    source: string;
  }[];
  edges: { from: string; to: string; relation: string }[];
  enabled: boolean;
  directory: string;
  engine: string;
  syncedAt: string;
  status: "ready";
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
  status: "complete" | "streaming" | "failed" | "cancelled";
  attachments?: { name: string; bytes: number }[];
}
export interface ChatSession {
  id: string;
  title: string;
  projectId: string;
  agent: Agent;
  model?: string | null;
  mode: "chat" | "plan";
  source: "default" | "local" | "github";
  root: string;
  workspace: string;
  status: "idle" | "running" | "failed" | "interrupted";
  /** owner/name for GitHub chats; the title changes after the first message. */
  repository?: string;
  messages: ChatMessage[];
  contextIds: string[];
  skillIds: string[];
  activity: string[];
  error: string | null;
  updatedAt: number;
}
export interface ProviderHealth {
  agent: Agent;
  state: "connected" | "needs-auth" | "unavailable";
  detail: string;
  models: { id: string; name: string }[];
  observedAt: string;
}

/** A portable transcript, deliberately excluding local paths and hidden context. */
export function chatMarkdown(chat: ChatSession): string {
  const line = (value: string) => value.replace(/[\r\n]+/g, " ");
  const messages = chat.messages.map((message) =>
    [
      `## ${message.role} · ${new Date(message.at).toISOString()} · ${message.status}`,
      message.content,
      ...(message.attachments?.length
        ? [
            `Attachments: ${message.attachments.map((file) => `${line(file.name)} (${file.bytes} bytes)`).join(", ")}`,
          ]
        : []),
    ].join("\n\n"),
  );
  return (
    [
      `# ${line(chat.title)}`,
      `Agenting OS · ${chat.agent} · ${chat.mode}`,
      ...messages,
    ].join("\n\n") + "\n"
  );
}
export const THEMES = [
  "white",
  "dark",
  "claude",
  "codex",
  "light",
  "classic",
] as const;
export type ThemeMode = (typeof THEMES)[number];
export interface Preferences {
  language: "pl" | "en";
  theme: ThemeMode;
}
export interface Integration {
  id: string;
  name: string;
  status: "not_configured";
  probe?: ProviderProbe;
  quota: {
    state: "unknown";
    remaining: null;
    unit: null;
    source: null;
    observedAt: null;
    resetAt: null;
  };
}
export type ProbeState = "passed" | "failed" | "unavailable" | "timed_out";
export interface ProviderProbe {
  installation: "installed" | "not_found" | "unknown";
  version: string | null;
  auth: "unknown";
  provenance: "local-command";
  observedAt: string;
  commands: {
    version: ProbeState;
    help: ProbeState;
    authStatus: ProbeState;
  };
  capabilities: {
    version: boolean;
    help: boolean;
    authStatus: boolean;
    execution: false;
  };
}
/**
 * Connector registry (plan v3, chapter 4). `ready` means detected, signed in
 * and backed by an execution adapter in this build; it is not a smoke test.
 */
export type ConnectorState =
  | "ready"
  | "needs-auth"
  | "needs-install"
  | "experimental"
  | "unsupported"
  | "degraded";
export type ConnectorReason =
  | "ok"
  | "not_found"
  | "auth_missing"
  | "auth_unknown"
  | "bridge_required"
  | "adapter_planned"
  | "server_down"
  | "probe_failed"
  | "vault_missing"
  | "connection_required"
  | "no_verified_integration";
export interface ConnectorStatus {
  id: string;
  name: string;
  kind: "cli" | "local-server" | "api" | "service";
  state: ConnectorState;
  reason: ConnectorReason;
  installed: boolean;
  path: string | null;
  version: string | null;
  auth: "authenticated" | "unauthenticated" | "unknown" | "not-applicable";
  account: string | null;
  /** Sign-in method reported by the official CLI, e.g. "claude.ai". */
  authMethod: string | null;
  /** Subscription tier reported by the official CLI, if it states one. */
  plan: string | null;
  /** Whether this build can run tasks through the connector. */
  adapter: "available" | "requires-bridge" | "planned" | "none";
  models: string[];
  installHint: string | null;
  quota: QuotaSnapshot;
  observedAt: string;
}
/** Provider-side limit. Unknown until an official source is verified (R0). */
export interface QuotaSnapshot {
  state: "unknown" | "known";
  unit: "requests" | "percent" | "tokens" | "usd" | null;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
  confidence: "exact" | "estimated" | "unavailable";
  source: "official-api" | "cli" | "response-headers" | null;
  observedAt: string | null;
  metrics?: QuotaMetric[];
  burnNotice?: string | null;
}
export interface QuotaMetric {
  id: string;
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string | null;
  resetNotice?: string | null;
  burnNotice?: string | null;
  periodSeconds: number;
  format: "percent" | "tokens" | "usd";
  usedValue: number | null;
  limitValue: number | null;
  unit?: string | null;
  /** The provider's own verdict for this window, when its CLI reported one. */
  state?: string;
}
export interface ProviderQuotaCard {
  id: string;
  name: string;
  plan: string;
  account: string | null;
  icon: string;
  status: "active" | "warning" | "exhausted" | "offline" | "not_configured";
  metrics: QuotaMetric[];
  usageTrend: number[];
  trendLabels?: string[];
  isCustom?: boolean;
  updatedAt: string;
  source?:
    | "codex-app-server"
    | "openrouter-api"
    | "cli-stream"
    | "claude-account"
    | "cli-statusline"
    | "manual"
    | "unavailable";
  detail?: string;
  /** Account balance in USD when the provider reports one (OpenRouter credits). */
  balanceUsd?: number | null;
  /** Card that shows another provider's account, e.g. OpenCode billed by OpenRouter. */
  via?: string;
}
/** State of the optional status line link for a CLI's own quota. */
export interface LimitBridgeStatus {
  agent: "claude" | "antigravity";
  /** The CLI settings file the link adds one statusLine entry to. */
  settingsPath: string;
  /** Exact command the entry runs. */
  command: string;
  installed: boolean;
  /** False when the settings file is not valid JSON (it is then left alone). */
  readable: boolean;
  /** The user's own status line command, kept and chained. */
  previous: string | null;
  lastReadingAt: number | null;
}
export interface CustomSubscriptionInput {
  id?: string;
  name: string;
  provider: string;
  plan: string;
  tokenLimit: number;
  tokensUsed: number;
  period: "session" | "daily" | "weekly" | "monthly";
  resetAt?: string | null;
}
export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number | null;
}
export interface OpenRouterSetting {
  disabledModels?: string[];
  configured: boolean;
  model: string;
  encryptionAvailable: boolean;
  /** An optional management key is saved; it only reads the account balance. */
  balanceKey?: boolean;
}
export interface OrchestrationState {
  id: string | null;
  projectId: string;
  status:
    | "idle"
    | "running"
    | "completed"
    | "blocked"
    | "stopped"
    | "failed"
    | "interrupted";
  taskIds: string[];
  completedTaskIds: string[];
  finished: number;
  runId: string | null;
  /** Up to two independent tasks at once, each in its own worktree. */
  parallel?: boolean;
  /** Runs in flight for a parallel batch. */
  runIds?: string[];
  reason: string | null;
  /** Agent a POLICY_* hold is waiting on (approval or a policy change). */
  policyAgent?: Agent;
  createdAt: number | null;
  updatedAt: number | null;
}
export interface OrchestrationEvent {
  seq: number;
  kind:
    | "created"
    | "dispatched"
    | "task_completed"
    | "reviewing"
    | "blocked"
    | "completed"
    | "failed"
    | "stopped"
    | "interrupted"
    | "resumed";
  status: OrchestrationState["status"];
  taskId: string | null;
  runId: string | null;
  reason: string | null;
  at: number;
}
export interface LocalUsage {
  provider: string;
  runsToday: number;
  runsTotal: number;
  lastRunAt: number | null;
}
export interface ConnectorScan {
  observedAt: string;
  connectors: ConnectorStatus[];
  usage: LocalUsage[];
  capabilities?: Capability[];
}
/** Evidence-backed capability row. "verified" needs a passed check and a real finished run. */
export interface Capability {
  agent: Agent;
  name: string;
  detected: boolean;
  version: string | null;
  configured: boolean;
  auth: "verified" | "reported" | "missing" | "unknown";
  handshake: "passed" | "failed" | "not_tested";
  handshakeAt: string | null;
  handshakeDetail: string | null;
  live: "passed" | "failed" | "not_tested";
  liveAt: number | null;
  successfulRuns: number;
  roles: ("implementer" | "reviewer" | "master")[];
  readOnly: boolean;
  models: number;
  verdict:
    | "verified"
    | "unverified"
    | "needs-auth"
    | "needs-connection"
    | "needs-install";
}
export interface BackupSummary {
  file: string;
  schema: number;
  bytes: number;
  projects: number;
  tasks: number;
  memory: number;
  runs: number;
  chats: number;
}
/** Something the operator should know about or decide, aggregated across projects. */
export interface AttentionItem {
  taskId?: string;
  kind:
    | "run_review"
    | "run_interrupted"
    | "apply_uncertain"
    | "run_failed"
    | "batch_interrupted"
    | "batch_blocked"
    | "mission_ready"
    | "mission_blocked"
    | "mission_interrupted"
    | "mission_needs_changes"
    | "run_active"
    | "batch_running"
    | "mission_active";
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  agent: string | null;
  reason: string | null;
  at: number;
  /** Where the operator acts on it. */
  target: "tasks" | "master";
}
export interface WorkBoard {
  observedAt: string;
  cards: {
    id: string;
    projectId: string;
    projectName: string;
    title: string;
    agent: Agent;
    stage: "queue" | "working" | "waiting" | "done";
    state: string;
    activity: string;
    at: number;
    blockedBy: number;
  }[];
  conversations: {
    id: string;
    title: string;
    agent: Agent;
    projectId: string;
    activity: string;
  }[];
}
export interface Attention {
  observedAt: string;
  decisions: AttentionItem[];
  active: AttentionItem[];
}
export interface CapabilityEvidence {
  checks: {
    agent: Agent;
    state: ProviderHealth["state"];
    detail: string;
    models: number;
    observedAt: string;
  }[];
  runs: {
    provider: string;
    successes: number;
    lastSuccessAt: number | null;
    lastFailureAt: number | null;
  }[];
}

export interface Snapshot {
  projects: Project[];
  preferences: Preferences;
  integrations: Integration[];
}
export interface ProjectData {
  tasks: Task[];
  memory: Memory[];
  events: TaskEvent[];
}
export interface API {
  integrationList(): Promise<IntegrationStatus[]>;
  integrationSave(input: {id: IntegrationId; apiKey?:string; clientId?:string; clientSecret?:string}): Promise<void>;
  integrationConnect(input: {id: IntegrationId}): Promise<void>;
  integrationDisconnect(input: {id: IntegrationId; forget?:boolean}): Promise<void>;
  integrationTools(input: {id: IntegrationId}): Promise<McpTool[]>;
  integrationCall(input: {id: IntegrationId; name:string; arguments:Record<string,unknown>; consent:true}): Promise<{text:string; isError:boolean}>;
  terminalList?(): Promise<TerminalSession[]>;
  providerInstallPlan?(input: { agent: Agent }): Promise<ProviderInstallPlan>;
  providerInstallStart?(input: { agent: Agent; consent: true }): Promise<TerminalSession>;
  providerLoginStart?(input: { agent: Agent; consent: true }): Promise<TerminalSession>;
  providerInstallStatus?(input: { agent: Agent }): Promise<{ plan: ProviderInstallPlan; session: TerminalSession | null; installed: boolean }>;
  terminalOpen?(input: {
    projectId?: string;
    consent: true;
    cols: number;
    rows: number;
  }): Promise<TerminalSession>;
  terminalRead?(input: { id: string; cursor: number }): Promise<TerminalRead>;
  terminalWrite?(input: { id: string; data: string }): Promise<void>;
  terminalResize?(input: {
    id: string;
    cols: number;
    rows: number;
  }): Promise<void>;
  terminalClose?(input: { id: string }): Promise<void>;
  voicePrepare?(input:{model:"tiny"|"base"|"small"}):Promise<boolean>;
  voiceBegin?(): Promise<boolean>;
  voiceTranscribe?(input:{audio:string;language:"pl"|"en";model?:"tiny"|"base"|"small"}):Promise<string>;
  scheduleList?(): Promise<{jobs:ScheduleJob[];runs:ScheduleRun[]}>;
  scheduleCreate?(input: {title:string;prompt:string;projectId:string;agent:Agent;time:string;weekdays?:number[];date?:string;consent:true}): Promise<ScheduleJob>;
  scheduleAction?(input: {id:string;action:"pause"|"resume"|"delete"|"run"}): Promise<void>;
  projectRename?(input: { id: string; name: string }): Promise<Project>;
  chatRename?(input: { id: string; title: string }): Promise<ChatSession>;
  openExternalLink?(input: { url: string }): Promise<void>;
  chatList?(): Promise<ChatSession[]>;
  chatCreate?(input: {
    agent: Agent;
    model?: string | null;
    mode: "chat" | "plan";
    source: "default" | "local" | "github";
    path?: string;
    repository?: string;
    projectId?: string;
  }): Promise<ChatSession>;
  chatSend?(input: {
    id: string;
    model?: string | null;
    message: string;
    contextIds: string[];
    skillIds: string[];
    consent: true;
    attachments?: { name: string; content: string }[];
  }): Promise<ChatSession>;
  githubRepositories?(): Promise<{ name: string; private: boolean }[] | null>;
  policyGet?(): Promise<{
    policy: WorkspacePolicy;
    /** This month's paid API spend reported by the provider; null = unknown. */
    spentUsd: number | null;
    /** Agents whose runs are paid per token with the current setup. */
    paidAgents: Agent[];
  }>;
  policySet?(input: {
    allowedAgents: Agent[];
    paidApi: WorkspacePolicy["paidApi"];
    monthlyBudgetUsd: number | null;
  }): Promise<WorkspacePolicy>;
  /** Usage ledger: per-agent totals for 30 days and the latest entries. */
  usageReport?(): Promise<{ summary: UsageSummary[]; recent: UsageEntry[] }>;
  routingHistory?(): Promise<RoutingHistoryEntry[]>;
  /** Preview a choice. Optional Jev performs one explicitly consented reasoning call. */
  routePreview?(input: {
    mode: RoutingMode;
    role: "implementer" | "reviewer";
    readOnly: boolean;
    author?: Agent;
    preferred?: Agent;
    taskKind?: "general" | "writing" | "coding";
    strict?: boolean;
    task?: string;
    jev?: { agent: Agent; model: string; consent: true };
  }): Promise<RoutingDecision>;
  /** Approve paid runs for one agent for 30 minutes, in memory only. */
  policyApprove?(input: { agent: Agent; consent: true }): Promise<void>;
  chatAction?(input: { id: string; action: "stop" | "delete" }): Promise<void>;
  chatRemember?(input: {
    id: string;
    messageId: string;
    content: string;
    scope: "project" | "workspace";
  }): Promise<Memory>;
  chatTask?(input: {
    id: string;
    messageId: string;
    reviewer: Agent;
  }): Promise<Task>;
  memoryList?(): Promise<Memory[]>;
  memoryGraph?(): Promise<MemoryGraph>;
  memoryAutoCapture?(input: { enabled: boolean }): Promise<MemoryGraph>;
  memoryVaultOpen?(): Promise<void>;
  memoryUpdate?(input: {
    projectId: string;
    id: string;
    content: string;
    scope: "project" | "workspace";
    pinned: boolean;
  }): Promise<void>;
  skillCatalog?(): Promise<Extension[]>;
  skillInstall?(input: { projectId: string; id: string; download?:boolean }): Promise<Extension>;
  skillImportFile?(input: { projectId: string }): Promise<Extension | null>;
  providerCheck?(input: { agent: Agent }): Promise<ProviderHealth>;
  providerSignIn?(input: {
    agent: "gemini" | "hermes";
  }): Promise<ProviderHealth>;
  providerConnectDetected?(input: {
    agent: Agent;
    consent: true;
  }): Promise<ProviderSetting[]>;
  missionPlan?(input: {
    projectId: string;
    goal: string;
    master: Agent;
    workers: Agent[];
    contextIds: string[];
    skillIds: string[];
    consent: true;
  }): Promise<Mission>;
  missionList?(input: { projectId: string }): Promise<Mission[]>;
  missionAction?(input: {
    projectId: string;
    id: string;
    action: "execute" | "stop";
    consent: true;
  }): Promise<Mission>;
  missionRemember?(input: {
    projectId: string;
    id: string;
    scope: "project" | "workspace";
  }): Promise<Memory>;
  localModelSettings?(): Promise<LocalModelSetting>;
  localModelSave?(input: {
    baseURL: string;
    model: string;
  }): Promise<LocalModelSetting>;
  localModelRemove?(): Promise<void>;
  orchestrationStart?(input: {
    projectId: string;
    taskIds: string[];
    contextIds: string[];
    consent: true;
    parallel?: boolean;
  }): Promise<OrchestrationState>;
  orchestrationState?(input: {
    projectId: string;
  }): Promise<OrchestrationState>;
  orchestrationStop?(input: { projectId: string }): Promise<void>;
  attention?(): Promise<Attention>;
  workBoard?(): Promise<WorkBoard>;
  backupCreate?(): Promise<BackupSummary | null>;
  backupRestore?(input: { consent: true }): Promise<BackupSummary | null>;
  diagnosticsExport?(): Promise<string | null>;
  restartApp?(): Promise<void>;
  restoreStatus?(): Promise<"none" | "restored" | "rejected">;
  orchestrationEvents?(input: {
    projectId: string;
  }): Promise<OrchestrationEvent[]>;
  orchestrationResume?(input: {
    projectId: string;
    batchId: string;
    consent: true;
  }): Promise<OrchestrationState>;
  openRouterSettings?(): Promise<OpenRouterSetting>;
  openRouterSave?(input: {
    disabledModels?: string[];
    apiKey?: string;
    /** Optional management key for the account balance; "" removes it. */
    managementKey?: string;
    model: string;
    consent: true;
  }): Promise<OpenRouterSetting>;
  openRouterRemove?(): Promise<void>;
  openRouterModels?(): Promise<OpenRouterModel[]>;
  providerDetect?(): Promise<Partial<Record<Agent, string>>>;
  extensionList(input: { projectId: string }): Promise<Extension[]>;
  extensionImport(input: {
    projectId: string;
    manifest: string;
    consent: true;
  }): Promise<Extension>;
  extensionRemove(input: { projectId: string; id: string }): Promise<void>;
  pluginCatalog?(input?: { projectId?: string }): Promise<Extension[]>;
  pluginInstall?(input: {
    projectId: string;
    id: string;
    consent: true;
  }): Promise<Extension>;
  extensionToggle?(input: {
    projectId: string;
    id: string;
    enabled: boolean;
  }): Promise<Extension>;
  localModelDiscover?(input?: { baseURL?: string }): Promise<LocalModelDiscovery>;
  localModelPing?(input: {
    baseURL: string;
    model: string;
  }): Promise<LocalModelPingResult>;
  runVerify?(input: {
    projectId: string;
    runId: string;
  }): Promise<VerificationReport>;
  runExportBranch?(input: {
    projectId: string;
    runId: string;
    branchName?: string;
  }): Promise<{ branchName: string; head: string }>;
  githubIssuesList?(input: { projectId: string }): Promise<GitHubIssueItem[]>;
  githubIssueImport?(input: {
    projectId: string;
    number: number;
    title: string;
    body: string;
    url: string;
    implementer: Agent;
    reviewer: Agent;
  }): Promise<Task>;
  gitRepoHealth?(input: { projectId: string }): Promise<GitRepoHealth>;
  skillCreateCustom?(input: {
    projectId: string;
    name: string;
    description: string;
    license: string;
    instructions: string;
  }): Promise<Extension>;
  mcpConnect(input: {
    projectId: string;
    id: string;
    consent: true;
  }): Promise<McpTool[]>;
  mcpCall(input: {
    projectId: string;
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    consent: true;
  }): Promise<{ isError: boolean; text: string }>;
  mcpDisconnect(input: { projectId: string; id: string }): Promise<void>;
  browserAction(input: {
    projectId: string;
    action:
      | "navigate"
      | "back"
      | "forward"
      | "reload"
      | "state"
      | "bounds"
      | "hide";
    url?: string;
    bounds?: { x: number; y: number; width: number; height: number };
  }): Promise<BrowserState | null>;
  runDecision?(input: {
    projectId: string;
    runId: string;
    action: "approve" | "reject" | "apply" | "rollback";
  }): Promise<void>;
  createDemoProject?(input?: { language?: "pl" | "en" }): Promise<Project>;
  harnessGet?(): Promise<HarnessSettings & { core: string }>;
  harnessSave?(input: HarnessSettingsInput): Promise<HarnessSettings & { core: string }>;
  memoryExport?(input: { projectId: string }): Promise<string>;
  memorySearch(input: { projectId: string; query: string }): Promise<Memory[]>;
  contextPreview(input: {
    projectId: string;
    contextIds: string[];
    workflow: string;
    skillIds?: string[];
    query?: string;
  }): Promise<ContextPreview>;
  runtimeView(input: {
    projectId: string;
    taskId: string;
  }): Promise<RuntimeView>;
  runtimeStart(input: {
    projectId: string;
    taskId: string;
    consent: true;
    resumeRunId?: string;
    /** Revise a reviewed result whose reviewer requested changes. */
    reviseRunId?: string;
    contextIds?: string[];
    workflow?: string;
    skillIds?: string[];
  }): Promise<Run>;
  runtimeAction(input: {
    projectId: string;
    runId: string;
    action: "cancel" | "steer";
    instruction?: string;
  }): Promise<void>;
  runtimeReview(input: {
    projectId: string;
    runId: string;
    consent: true;
  }): Promise<Run>;
  configureProvider(input: {
    agent: Agent;
    command: string;
    args: string[];
    protocol: "codex" | "acp" | "claude-cli" | "antigravity-cli";
    profile?: "isolated" | "existing";
    model?: string | null;
    consent: true;
  }): Promise<void>;
  providerSettings(): Promise<ProviderSetting[]>;
  providerToggle(input: {agent: Agent; enabled: boolean}): Promise<void>;
  chooseExecutable(): Promise<string | null>;
  chooseRepository(): Promise<string | null>;
  providerLogin(): Promise<void>;
  runArtifact(input: { projectId: string; runId: string }): Promise<{
    id: string;
    diffHash: string;
    diff: string;
    approvals: unknown[];
  } | null>;
  snapshot(): Promise<Snapshot>;
  connectorScan?(): Promise<ConnectorScan>;
  taskAction(input: TaskAction): Promise<void>;
  projectData(id: string): Promise<ProjectData>;
  createProject(
    input: Pick<Project, "name" | "root" | "master">,
  ): Promise<Project>;
  createTask(
    input: Pick<Task, "projectId" | "title" | "implementer" | "reviewer">,
  ): Promise<Task>;
  createMemory(
    input: Pick<Memory, "projectId" | "content" | "source" | "scope">,
  ): Promise<Memory>;
  deleteMemory(input: { projectId: string; id: string }): Promise<void>;
  setPreferences(input: Preferences): Promise<Preferences>;
  setMaster(input: { projectId: string; master: Agent }): Promise<void>;
  quotaScan?(): Promise<ProviderQuotaCard[]>;
  quotaSaveCustom?(input: CustomSubscriptionInput): Promise<ProviderQuotaCard>;
  quotaDeleteCustom?(id: string): Promise<void>;
  quotaRefresh?(): Promise<ProviderQuotaCard[]>;
  limitBridgeStatus?(): Promise<LimitBridgeStatus[]>;
  limitBridgeInstall?(input: {
    agent: LimitBridgeStatus["agent"];
    consent: true;
  }): Promise<LimitBridgeStatus>;
  limitBridgeRemove?(input: {
    agent: LimitBridgeStatus["agent"];
  }): Promise<LimitBridgeStatus>;
}

export interface TerminalSession {
  id: string;
  projectId: string | null;
  cwd: string;
  shell: string;
  state: "running" | "exited";
  exitCode: number | null;
  createdAt: number;
}
export interface TerminalRead {
  data: string;
  cursor: number;
  reset: boolean;
  state: TerminalSession["state"];
  exitCode: number | null;
}
export interface Extension {
  id: string;
  kind: "skill" | "mcp" | "plugin" | "hook";
  name: string;
  version: string;
  author: string;
  license: string;
  source: string;
  slug?: string;
  files?: number;
  installed?: boolean;
  enabled?: boolean;
  description?: string;
  category?: string;
  pluginId?: string;
  installPath?: string;
  instructions?: string;
  command?: string;
  args?: string[];
}
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export type IntegrationId = "notion" | "canva" | "google-drive" | "firecrawl" | "linear" | "asana" | "atlassian";
export interface IntegrationStatus {
  id: IntegrationId;
  state: "disconnected" | "connecting" | "connected" | "error";
  configured: boolean;
  toolCount: number;
  encryptionAvailable: boolean;
}
export interface BrowserState {
  url: string;
  title: string;
  loading: boolean;
  error: boolean;
  back: boolean;
  forward: boolean;
}
export type RunState =
  | "preparing"
  | "running"
  | "reviewing"
  | "awaiting_review"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "applied"
  | "rejected"
  | "applying"
  | "apply_uncertain";
export interface Run {
  id: string;
  projectId: string;
  taskId: string;
  attempt: number;
  state: RunState;
  provider: Agent;
  reviewer: Agent;
  repository: string;
  worktree: string;
  base: string;
  head: string;
  threadId: string | null;
  turnId: string | null;
  artifactId: string | null;
  reviewState: "not_run" | "running" | "completed" | "failed";
  reviewText: string;
  summary: string;
  error: string | null;
  approvalId: string | null;
  previousRunId: string | null;
  createdAt: number;
  updatedAt: number;
}
export interface RunEvent {
  seq: number;
  kind: string;
  text: string;
  at: number;
}
/** One agent invocation. Null tokens mean the CLI reported nothing: unknown. */
export interface UsageEntry {
  id: number;
  agent: Agent;
  role: "implementer" | "reviewer" | "chat" | "master";
  projectId: string | null;
  runId: string | null;
  outcome: "completed" | "failed" | "cancelled";
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  source: "cli-stream" | "unknown";
  paid: boolean;
  at: number;
}
export interface UsageSummary {
  agent: Agent;
  invocations: number;
  /** Invocations with a CLI token report. */
  measured: number;
  /** Invocations without one; their tokens are not counted anywhere. */
  unmeasured: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  paid: number;
}
export type RoutingMode =
  | "manual"
  | "balanced"
  | "subscription-first"
  | "quality-first";
/** Explainable agent choice: every point and every rejection has a reason. */
export interface RoutingDecision {
  mode: RoutingMode;
  choice: Agent | null;
  ranked: { agent: Agent; score: number; reasons: string[] }[];
  rejected: { agent: Agent; reasons: string[] }[];
  reason: string;
}
export interface RoutingHistoryEntry { id: string; at: string; decision: RoutingDecision }
/** Workspace rules the application enforces before any agent starts. */
export interface WorkspacePolicy {
  /** Agents allowed to run; empty means every connected agent. */
  allowedAgents: Agent[];
  /** Pay-per-token API runs (OpenCode via OpenRouter). */
  paidApi: "deny" | "ask" | "allow";
  /** Monthly cap for paid API spend in USD; null means no cap set. */
  monthlyBudgetUsd: number | null;
  updatedAt: string | null;
}
export interface ProviderSetting {
  id: Agent;
  configured: boolean;
  command: string;
  args: string[];
  protocol: string;
  profile?: "isolated" | "existing";
  model?: string | null;
  /** Last recorded connection check; absent until one ran. */
  lastCheck?: { state: ProviderHealth["state"]; observedAt: string } | null;
}
export interface RuntimeView {
  runs: Run[];
  events: RunEvent[];
  providers: ProviderSetting[];
}

/**
 * One place that turns an error code into something an operator can act on.
 * Codes come from the main process as either "CODE" or "Error: CODE ...", so the
 * lookup is a substring match on the longest known code.
 */
export interface ErrorExplanation {
  /** Matched code, or "UNKNOWN" when nothing matched. */
  code: string;
  /** Short headline; never the raw code. */
  title: string;
  /** What to do next. */
  hint: string;
  /** Original value, kept for the details disclosure. */
  raw: string;
}
interface ErrorCopy {
  pl: [title: string, hint: string];
  en: [title: string, hint: string];
}
const ERRORS: Record<string, ErrorCopy> = {
  HARNESS_SETTINGS_CONFLICT: {
    pl: ["Ustawienia zostały zmienione", "Skopiuj swoje zmiany, wczytaj zapisane ustawienia i połącz obie wersje przed ponownym zapisem."],
    en: ["Settings changed elsewhere", "Copy your edits, load the saved settings and reconcile both versions before saving again."],
  },
  PROVIDER_NOT_CONFIGURED: {
    pl: ["Agent nie jest podłączony", "Otwórz Połączenia, sprawdź wykrywanie CLI, zapisz ustawienia i spróbuj ponownie."],
    en: ["This agent is not connected", "Open Connections, re-run detection, save the settings and try again."],
  },
  PROVIDER_MODEL_REQUIRED: {
    pl: ["Brak wybranego modelu", "W Połączeniach wybierz i zapisz model, np. z subskrypcji ChatGPT/Codex."],
    en: ["No model selected", "Pick and save a model in Connections, for example a ChatGPT/Codex subscription model."],
  },
  PROVIDER_AUTH_REQUIRED: {
    pl: ["Agent wymaga logowania", "Zaloguj konto dostawcy, potem wróć tutaj i wyślij wiadomość ponownie."],
    en: ["The agent needs a sign-in", "Sign in to the provider, then come back and send the message again."],
  },
  PROVIDER_MODEL_UNAVAILABLE: {
    pl: ["Model jest niedostępny", "Odśwież listę modeli w Połączeniach i wybierz dostępny model."],
    en: ["The model is unavailable", "Refresh the model list in Connections and pick an available model."],
  },
  READ_ONLY_PROVIDER_REQUIRED: {
    pl: ["Ten agent nie ma trybu planowania", "Wybierz tryb rozmowy albo agenta ze zweryfikowanym trybem tylko do odczytu."],
    en: ["This agent has no planning mode", "Switch to chat or pick an agent with a verified read-only mode."],
  },
  POLICY_APPROVAL_REQUIRED: {
    pl: ["Zadanie wymaga zgody na płatne API", "Sprawdź koszt i zatwierdź jednorazowo albo zmień politykę projektu."],
    en: ["This task needs paid-API approval", "Review the cost and approve once, or change the project policy."],
  },
  BUDGET_EXCEEDED: {
    pl: ["Wyczerpany budżet projektu", "Podnieś limit miesięczny w Polityce albo przełącz na dostawcę subskrypcyjnego."],
    en: ["Project budget exhausted", "Raise the monthly cap in Policy or switch to a subscription provider."],
  },
  RUN_CANCELLED: {
    pl: ["Zadanie zatrzymane", "Nic nie zostało zastosowane. Możesz uruchomić je ponownie, gdy będziesz gotowy."],
    en: ["The run was cancelled", "Nothing was applied. You can start it again when you are ready."],
  },
  RUN_ALREADY_ACTIVE: {
    pl: ["Ten projekt już pracuje", "Poczekaj na zakończenie aktywnego zadania lub je zatrzymaj."],
    en: ["This project is already running", "Wait for the active run to finish, or stop it first."],
  },
  STOP_UNCONFIRMED: {
    pl: ["Nie potwierdzono zatrzymania procesu", "Sprawdź Menedżer zadań: proces agenta może nadal działać. Nie uruchamiaj kolejnego zadania."],
    en: ["Process stop was not confirmed", "Check the task manager: the agent process may still be running. Do not start another task."],
  },
  STOP_NOT_CONFIRMED: {
    pl: ["Nie potwierdzono zatrzymania procesu", "Sprawdź, czy proces agenta nie działa w tle, i dopiero wtedy spróbuj ponownie."],
    en: ["Process stop was not confirmed", "Check that no agent process is still running, then try again."],
  },
  MISSION_ALREADY_ACTIVE: {
    pl: ["Misja już trwa", "Zakończ lub zatrzymaj bieżącą misję przed uruchomieniem nowej."],
    en: ["A mission is already active", "Finish or stop the current mission before starting another."],
  },
  REVISION_LIMIT_REACHED: {
    pl: ["Wyczerpany limit poprawek", "Przejrzyj dyskusję, popraw zadanie lub zaakceptuj wynik świadomie."],
    en: ["Revision limit reached", "Review the thread, refine the task or accept the result deliberately."],
  },
  INDEPENDENT_REVIEW_REQUIRED: {
    pl: ["Recenzent musi być inny niż wykonawca", "Wybierz innego agenta do recenzji — to warunek niezależnej oceny."],
    en: ["Reviewer must differ from implementer", "Pick a different agent for review; independence is required."],
  },
  READ_ONLY_WORKSPACE_CHANGED: {
    pl: ["Pliki zmieniły się podczas badania", "Projekt był tylko do odczytu, ale zawartość się zmieniła. Zrób nowy przebieg."],
    en: ["Files changed during a read-only step", "The workspace was read-only but its content changed. Run this step again."],
  },
  WORKTREE_CHANGED: {
    pl: ["Worktree zmienił się poza aplikacją", "Ktoś lub coś zmieniło pliki w worktree. Odrzuć ten przebieg i uruchom nowy."],
    en: ["The worktree changed outside the app", "Something modified the worktree files. Reject this run and start a new one."],
  },
  BASE_CHANGED: {
    pl: ["Baza repozytorium się przesunęła", "Główna gałąź ma nowe zmiany. Zsynchronizuj projekt i powtórz zadanie."],
    en: ["The base branch moved", "The main branch has new commits. Sync the project and run the task again."],
  },
  HEAD_MOVED_SINCE_APPLY: {
    pl: ["Repozytorium ma nowsze commity po zastosowaniu", "Nie można automatycznie cofnąć zmiany, gdy po niej pojawiły się nowe commity."],
    en: ["Repository has newer commits since apply", "Cannot automatically roll back when newer commits were added on top."],
  },
  INVALID_WORKTREE: {
    pl: ["Nieprawidłowy katalog roboczy", "Sprawdź, czy projekt ma własny worktree i czy ścieżka istnieje."],
    en: ["Invalid worktree", "Check that the project has its own worktree and that the path exists."],
  },
  INVALID_MASTER_PLAN: {
    pl: ["Plan misji jest niepoprawny", "Master zwrócił plan, którego nie da się wykonać. Uruchom planowanie ponownie lub doprecyzuj cel."],
    en: ["The mission plan is invalid", "The master returned a plan that cannot run. Re-plan or make the goal more specific."],
  },
  INVALID_INPUT: {
    pl: ["Niepełne dane", "Uzupełnij wymagane pola i spróbuj ponownie."],
    en: ["Incomplete input", "Fill in the required fields and try again."],
  },
  INVALID_TRANSITION: {
    pl: ["Ta zmiana stanu jest niedozwolona", "Odśwież widok — stan zadania zmienił się w międzyczasie."],
    en: ["That state change is not allowed", "Refresh the view; the task state changed in the meantime."],
  },
  NOT_FOUND: {
    pl: ["Nie znaleziono obiektu", "Odśwież listę — element mógł zostać usunięty."],
    en: ["Item not found", "Refresh the list; the item may have been deleted."],
  },
  TASK_HELD_BY_QUEUE: {
    pl: ["Zadanie przejęła kolejka", "Poczekaj na zakończenie przebiegu kolejki lub zatrzymaj go."],
    en: ["The queue holds this task", "Wait for the queue run to finish, or stop it."],
  },
  TOOL_NOT_READY: {
    pl: ["Narzędzie nie jest gotowe", "Poczekaj, aż agent zakończy start, i ponów akcję."],
    en: ["The tool is not ready", "Wait for the agent to finish starting, then retry."],
  },
  TOOL_LIMIT: {
    pl: ["Przekroczony limit narzędzi", "Zwiększ limit w ustawieniach projektu albo podziel zadanie na mniejsze."],
    en: ["Tool limit exceeded", "Raise the project limit or split the task into smaller ones."],
  },
  TERMINAL_FOLDER_REQUIRED: {
    pl: ["Terminal wymaga folderu", "Otwórz projekt z katalogiem roboczym i uruchom terminal ponownie."],
    en: ["The terminal needs a folder", "Open a project with a working directory, then start the terminal again."],
  },
  TERMINAL_LIMIT: {
    pl: ["Limit sesji terminala", "Zamknij nieużywane sesje i spróbuj ponownie."],
    en: ["Terminal session limit", "Close unused sessions and try again."],
  },
  SKILL_FOLDER_EXISTS: {
    pl: ["Taki skill już istnieje", "Wybierz inną nazwę albo usuń istniejący wpis."],
    en: ["That skill already exists", "Pick another name or remove the existing entry."],
  },
  SKILL_PATH_UNSAFE: {
    pl: ["Niebezpieczna ścieżka skilla", "Nazwa wykracza poza katalog skilli. Wybierz prostą nazwę bez ../."],
    en: ["Unsafe skill path", "The name escapes the skills folder. Use a plain name without ../."],
  },
  MEMORY_PATH_UNSAFE: {
    pl: ["Niebezpieczna ścieżka pamięci", "Wpis wskazuje poza magazyn pamięci. Popraw źródło."],
    en: ["Unsafe memory path", "The entry points outside the memory store. Fix the source."],
  },
  EXTENSION_NOT_FOUND: {
    pl: ["Nie znaleziono rozszerzenia", "Odśwież katalog rozszerzeń i zainstaluj je ponownie."],
    en: ["Extension not found", "Refresh the extensions catalog and install it again."],
  },
  EXPLICIT_CONSENT_REQUIRED: {
    pl: ["Potrzebna wyraźna zgoda", "Ta operacja zmienia pliki poza projektem — zaznacz zgodę świadomie."],
    en: ["Explicit consent required", "This operation writes outside the project; confirm it deliberately."],
  },
  GITHUB_CLONE_FAILED: {
    pl: ["Nie udało się pobrać repozytorium", "Sprawdź nazwę repozytorium i zaloguj się przez gh auth login."],
    en: ["Could not clone the repository", "Check the repository name and sign in with gh auth login."],
  },
  LOAD_FAILED: {
    pl: ["Nie udało się wczytać danych", "Sprawdź, czy baza projektu jest dostępna, i odśwież widok."],
    en: ["Could not load data", "Check that the project database is reachable, then refresh."],
  },
  COPY_FAILED: {
    pl: ["Nie udało się skopiować", "Zaznacz tekst i skopiuj ręcznie (Ctrl+C)."],
    en: ["Copy failed", "Select the text and copy it manually (Ctrl+C)."],
  },
  UNSUPPORTED_SCHEMA: {
    pl: ["Baza ma nowszy format", "Ta wersja aplikacji nie odczyta tej bazy. Zaktualizuj aplikację."],
    en: ["The database uses a newer schema", "This app version cannot read it. Update the application."],
  },
};
const UNKNOWN: ErrorCopy = {
  pl: ["Operacja nie powiodła się", "Sprawdź połączenie agenta i szczegóły techniczne poniżej, potem spróbuj ponownie."],
  en: ["The operation failed", "Check the agent connection and the technical details below, then try again."],
};
/** Longest code first, so TERMINAL_LIMIT never wins over a longer match. */
const CODES = Object.keys(ERRORS).sort((a, b) => b.length - a.length);
export function explainError(value: string, pl: boolean): ErrorExplanation {
  const raw = value ?? "";
  const code = CODES.find((candidate) => raw.includes(candidate)) ?? "UNKNOWN";
  const copy = code === "UNKNOWN" ? UNKNOWN : ERRORS[code];
  const [title, hint] = pl ? copy.pl : copy.en;
  return { code, title, hint, raw };
}

export interface ScheduleJob {
  id:string; title:string; prompt:string; projectId:string; agent:Agent; time:string;
  weekdays?:number[]; date?:string;
  enabled:boolean; requested?:boolean; nextRunAt:number; createdAt:number;
}
export interface ScheduleRun {
  id:string; jobId:string; title:string; status:"running"|"complete"|"failed"|"interrupted";
  startedAt:number; finishedAt?:number; chatId:string|null; error:string|null;
}
