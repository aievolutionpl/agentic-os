export type Agent = "codex" | "claude";
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
    protocol: "codex" | "acp";
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
  taskAction(input: TaskAction): Promise<void>;
  projectData(id: string): Promise<ProjectData>;
  createProject(
    input: Pick<Project, "name" | "root" | "master">,
  ): Promise<Project>;
  createTask(
    input: Pick<Task, "projectId" | "title" | "implementer" | "reviewer">,
  ): Promise<Task>;
  createMemory(
    input: Pick<Memory, "projectId" | "content" | "source">,
  ): Promise<Memory>;
  deleteMemory(input: { projectId: string; id: string }): Promise<void>;
  setPreferences(input: Preferences): Promise<Preferences>;
  setMaster(input: { projectId: string; master: Agent }): Promise<void>;
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
}
export interface RuntimeView {
  runs: Run[];
  events: RunEvent[];
  providers: ProviderSetting[];
}
