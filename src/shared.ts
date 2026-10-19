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
export const READ_ONLY_AGENTS: readonly Agent[] = [
  "codex",
  "claude",
  "gemini",
  "opencode",
  "local",
];
export interface LocalModelSetting {
  configured: boolean;
  baseURL: string;
  model: string;
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
  createdAt: string;
}
export type FailureCode =
  "worker_error" | "validation_failed" | "lease_expired";
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
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
  status: "complete" | "streaming" | "failed" | "cancelled";
}
export interface ChatSession {
  id: string;
  title: string;
  projectId: string;
  agent: Agent;
  mode: "chat" | "plan";
  source: "default" | "local" | "github";
  root: string;
  workspace: string;
  status: "idle" | "running" | "failed" | "interrupted";
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
export interface Preferences {
  language: "pl" | "en";
  theme: "dark" | "light";
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
  source?: "codex-app-server" | "openrouter-api" | "manual" | "unavailable";
  detail?: string;
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
  configured: boolean;
  model: string;
  encryptionAvailable: boolean;
}
export interface OrchestrationState {
  projectId: string;
  status: "idle" | "running" | "completed" | "blocked" | "stopped" | "failed";
  taskIds: string[];
  finished: number;
  runId: string | null;
  reason: string | null;
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
  chatList?(): Promise<ChatSession[]>;
  chatCreate?(input: {
    agent: Agent;
    mode: "chat" | "plan";
    source: "default" | "local" | "github";
    path?: string;
    repository?: string;
    projectId?: string;
  }): Promise<ChatSession>;
  chatSend?(input: {
    id: string;
    message: string;
    contextIds: string[];
    skillIds: string[];
    consent: true;
  }): Promise<ChatSession>;
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
  memoryUpdate?(input: {
    projectId: string;
    id: string;
    content: string;
    scope: "project" | "workspace";
    pinned: boolean;
  }): Promise<void>;
  skillCatalog?(): Promise<Extension[]>;
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
  }): Promise<OrchestrationState>;
  orchestrationState?(input: {
    projectId: string;
  }): Promise<OrchestrationState>;
  orchestrationStop?(input: { projectId: string }): Promise<void>;
  openRouterSettings?(): Promise<OpenRouterSetting>;
  openRouterSave?(input: {
    apiKey?: string;
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
      "navigate" | "back" | "forward" | "reload" | "state" | "bounds" | "hide";
    url?: string;
    bounds?: { x: number; y: number; width: number; height: number };
  }): Promise<BrowserState | null>;
  runDecision?(input: {
    projectId: string;
    runId: string;
    action: "approve" | "reject" | "apply";
  }): Promise<void>;
  memorySearch(input: { projectId: string; query: string }): Promise<Memory[]>;
  contextPreview(input: {
    projectId: string;
    contextIds: string[];
    workflow: string;
    skillIds?: string[];
  }): Promise<{
    body: string;
    characters: number;
    limit: number;
    readOnly: boolean;
    memoryIds: string[];
    workflow: string;
  }>;
  runtimeView(input: {
    projectId: string;
    taskId: string;
  }): Promise<RuntimeView>;
  runtimeStart(input: {
    projectId: string;
    taskId: string;
    consent: true;
    resumeRunId?: string;
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
}
export interface Extension {
  id: string;
  kind: "skill" | "mcp";
  name: string;
  version: string;
  author: string;
  license: string;
  source: string;
  instructions?: string;
  command?: string;
  args?: string[];
}
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
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
export interface ProviderSetting {
  id: Agent;
  configured: boolean;
  command: string;
  args: string[];
  protocol: string;
  profile?: "isolated" | "existing";
  model?: string | null;
}
export interface RuntimeView {
  runs: Run[];
  events: RunEvent[];
  providers: ProviderSetting[];
}
