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
}
export interface Preferences {
  language: "pl" | "en";
  theme: "dark" | "light";
}
export interface Integration {
  id: string;
  name: string;
  status: "not_configured";
  quota: {
    state: "unknown";
    remaining: null;
    unit: null;
    source: null;
    observedAt: null;
    resetAt: null;
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
