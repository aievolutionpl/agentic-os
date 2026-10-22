import { spawn } from "node:child_process";
import type { Store } from "./store.js";
import type { Agent, GitHubIssueItem, Task } from "../shared.js";
import { AGENTS } from "../shared.js";
import { exact, text } from "./validate.js";
import { git, gitText } from "./git.js";

function runGhInDir(
  cwd: string,
  args: readonly string[],
  timeoutMs = 10_000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };
    let child;
    try {
      child = spawn("gh", args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch {
      done(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      done(null);
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < 65_536) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 16_384) stderr += chunk.toString("utf8");
    });
    child.on("error", () => done(null));
    child.on("close", (code) => done(code));
  });
}

export async function listGitHubIssues(
  store: Store,
  input: unknown,
): Promise<GitHubIssueItem[]> {
  const p = exact(input, ["projectId"]);
  const projectId = text(p.projectId);
  const project = store.projects().find((item) => item.id === projectId);
  if (!project) throw Error("PROJECT_NOT_FOUND");
  if (!project.root) throw Error("FOLDER_REQUIRED");

  const res = await runGhInDir(project.root, [
    "issue",
    "list",
    "--limit",
    "20",
    "--state",
    "open",
    "--json",
    "number,title,body,url,labels",
  ]);
  if (res.code !== 0) return [];
  try {
    const parsed = JSON.parse(res.stdout);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((raw): GitHubIssueItem | null => {
        if (!raw || typeof raw !== "object") return null;
        const r = raw as Record<string, unknown>;
        if (typeof r.number !== "number" || typeof r.title !== "string")
          return null;
        const labels = Array.isArray(r.labels)
          ? r.labels
              .map((l) =>
                l &&
                typeof l === "object" &&
                typeof (l as { name?: unknown }).name === "string"
                  ? String((l as { name: string }).name).slice(0, 40)
                  : "",
              )
              .filter(Boolean)
          : [];
        return {
          number: r.number,
          title: r.title.slice(0, 200),
          body: typeof r.body === "string" ? r.body.slice(0, 4000) : "",
          url: typeof r.url === "string" ? r.url.slice(0, 500) : "",
          labels,
        };
      })
      .filter((item): item is GitHubIssueItem => item !== null);
  } catch {
    return [];
  }
}

export function importGitHubIssueAsTask(store: Store, input: unknown): Task {
  const p = exact(input, [
    "projectId",
    "number",
    "title",
    "body",
    "url",
    "implementer",
    "reviewer",
  ]);
  const projectId = text(p.projectId);
  const number = Number(p.number);
  if (!Number.isInteger(number) || number <= 0) throw Error("INVALID_INPUT");
  const rawTitle = text(p.title, 180);
  const body = typeof p.body === "string" ? p.body.slice(0, 6000).trim() : "";
  const url = typeof p.url === "string" ? p.url.slice(0, 500).trim() : "";
  const implementer = text(p.implementer) as Agent;
  const reviewer = text(p.reviewer) as Agent;
  if (!AGENTS.includes(implementer) || !AGENTS.includes(reviewer))
    throw Error("INVALID_INPUT");

  const taskTitle = `#${number}: ${rawTitle}`.slice(0, 200);
  const task = store.createTask({
    projectId,
    title: taskTitle,
    implementer,
    reviewer,
  });

  const source = `github:issue#${number}`;
  if (!store.memory(projectId).some((m) => m.source === source)) {
    const contentLines = [
      `GitHub Issue #${number}: ${rawTitle}`,
      ...(url ? [`URL: ${url}`] : []),
      ...(body ? ["", body] : []),
    ];
    store.createMemory({
      projectId,
      source,
      scope: "project",
      content: contentLines.join("\n").slice(0, 8000),
    });
  }

  return task;
}

export async function exportRunToBranch(
  store: Store,
  input: unknown,
): Promise<{ branchName: string; head: string }> {
  const p = exact(input, ["projectId", "runId", "branchName"]);
  const projectId = text(p.projectId);
  const runId = text(p.runId);
  const run = store.runs.get(projectId, runId);
  if (!run) throw Error("RUN_NOT_FOUND");
  if (!run.repository || !run.head) throw Error("INVALID_WORKTREE");

  const defaultBranch = `agentic/task-${run.taskId.slice(0, 8)}-v${run.attempt}`;
  const requested =
    typeof p.branchName === "string" && p.branchName.trim()
      ? p.branchName.trim()
      : defaultBranch;
  if (
    !/^[A-Za-z0-9._/-]{3,80}$/.test(requested) ||
    requested.includes("..") ||
    requested.startsWith("-") ||
    requested.endsWith("/") ||
    requested.endsWith(".lock")
  )
    throw Error("INVALID_INPUT");

  await git(run.repository, ["branch", "-f", requested, run.head]);
  const resolved = await gitText(run.repository, "rev-parse", requested);
  if (resolved !== run.head) throw Error("BRANCH_EXPORT_FAILED");

  store.runs.event(
    run.id,
    "application",
    `Exported run commit ${run.head.slice(0, 12)} to local branch ${requested}.`,
  );

  return { branchName: requested, head: run.head };
}
