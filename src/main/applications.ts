import { createHash } from "node:crypto";
import type { Store } from "./store.js";
import type { Run } from "../shared.js";
import { Worktrees, git, gitText } from "./git.js";
import { readCommittedDiff } from "./artifacts.js";
import { exact, text } from "./validate.js";
export class Applications {
  private active = new Set<string>();
  constructor(
    private store: Store,
    private worktrees: Worktrees,
    private clock: () => number = Date.now,
  ) {}
  async reconcile() {
    for (const project of this.store.projects())
      for (const run of this.store.runs.list(project.id)) {
        if (!["applying", "apply_uncertain"].includes(run.state)) continue;
        const head = await gitText(run.repository, "rev-parse", "HEAD").catch(
          () => "",
        );
        if (head === run.head) {
          this.store.runs.update(project.id, run.id, {
            state: "applied",
            error: null,
          });
          this.store.runs.event(
            run.id,
            "recovery",
            "Read-only recovery confirmed the approved target commit. No application was replayed.",
          );
        }
      }
  }
  private async artifact(run: Run) {
    const task = this.store
      .tasks(run.projectId)
      .find((task) => task.id === run.taskId);
    if (
      !task ||
      task.attempt !== run.attempt ||
      this.store.runs.list(run.projectId, run.taskId)[0]?.id !== run.id ||
      !run.artifactId
    )
      throw Error("STALE_RUN");
    const artifact = this.store.artifacts.get(
      run.projectId,
      run.taskId,
      run.artifactId,
    );
    if (
      !artifact ||
      artifact.base !== run.base ||
      artifact.target !== run.head ||
      artifact.worktree !== run.worktree ||
      artifact.repository !== run.repository ||
      createHash("sha256").update(artifact.diff).digest("hex") !==
        artifact.diffHash
    )
      throw Error("INVALID_ARTIFACT");
    await this.worktrees.verify({
      repository: run.repository,
      path: run.worktree,
      base: run.base,
      head: run.head,
    });
    if (
      (await gitText(run.worktree, "rev-parse", "HEAD")) !== run.head ||
      (
        await git(run.worktree, [
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
        ])
      ).length
    )
      throw Error("WORKTREE_CHANGED");
    const current = await readCommittedDiff(run.worktree, run.base, run.head);
    if (!current.equals(artifact.diff)) throw Error("ARTIFACT_CHANGED");
    if (
      /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/.test(
        current.toString("utf8"),
      )
    )
      throw Error("CREDENTIAL_LIKE_CONTENT");
    const raw = (
      await git(run.worktree, [
        "diff",
        "--raw",
        "--no-renames",
        "-z",
        run.base,
        run.head,
        "--",
      ])
    )
      .toString("utf8")
      .split("\0");
    for (let i = 0; i < raw.length - 1; i += 2) {
      const modes = raw[i]
          .split(" ")
          .slice(0, 2)
          .map((mode) => mode.replace(":", "")),
        path = raw[i + 1];
      if (
        modes.some((mode) => !["100644", "100755", "000000"].includes(mode)) ||
        path
          .split(/[\\/]/)
          .some((part) =>
            /^(?:\.git|\.gitmodules|\.env(?:\..*)?|auth\.json|credentials\.json|id_rsa|id_ed25519)$/i.test(
              part,
            ),
          )
      )
        throw Error("PROTECTED_CHANGE");
    }
    return artifact;
  }
  async decide(input: unknown) {
    const p = exact(input, ["projectId", "runId", "action"]),
      projectId = text(p.projectId),
      run = this.store.runs.get(projectId, text(p.runId));
    if (!run) throw Error("RUN_NOT_FOUND");
    if (!["approve", "reject", "apply"].includes(String(p.action)))
      throw Error("INVALID_ACTION");
    if (p.action === "apply" && run.state === "applied") return;
    if (run.state !== "awaiting_review" || this.active.has(run.repository))
      throw Error("RUN_NOT_REVIEWABLE");
    this.active.add(run.repository);
    try {
      const artifact = await this.artifact(run);
      if (p.action === "approve" || p.action === "reject") {
        if (p.action === "approve" && run.reviewState !== "completed")
          throw Error("INDEPENDENT_REVIEW_REQUIRED");
        const approval = this.store.approvals.decide({
          projectId,
          taskId: run.taskId,
          attempt: run.attempt,
          artifactId: artifact.id,
          decision: p.action === "approve" ? "approved" : "rejected",
          approver: "local-user",
          expiresAt: this.clock() + 15 * 60 * 1000,
        });
        this.store.runs.update(projectId, run.id, {
          approvalId: p.action === "approve" ? approval.id : null,
          ...(p.action === "reject" ? { state: "rejected" as const } : {}),
        });
        this.store.runs.event(
          run.id,
          "approval",
          p.action === "approve"
            ? "Human approved the exact captured artifact. Application is still a separate action."
            : "Human rejected this artifact. Source repository unchanged.",
        );
        return;
      }
      if (
        !run.approvalId ||
        run.reviewState !== "completed" ||
        !this.store.approvals.matches({
          id: run.approvalId,
          projectId,
          taskId: run.taskId,
          attempt: run.attempt,
          artifactId: artifact.id,
          diff: artifact.diff,
        })
      )
        throw Error("VALID_APPROVAL_REQUIRED");
      const approvals = this.store.approvals
        .list(projectId, run.taskId)
        .filter((record) => record.artifactId === artifact.id);
      if (approvals.at(-1)?.id !== run.approvalId)
        throw Error("APPROVAL_SUPERSEDED");
      const source = await this.worktrees.inspect(run.repository);
      if (source.base !== run.base) throw Error("BASE_CHANGED");
      this.store.runs.update(projectId, run.id, { state: "applying" });
      this.store.runs.event(
        run.id,
        "application",
        "Applying the approved commit by fast-forward; hooks and external filters are disabled.",
      );
      try {
        await git(run.repository, [
          "merge",
          "--ff-only",
          "--no-edit",
          "--no-stat",
          "--no-overwrite-ignore",
          run.head,
        ]);
        if ((await gitText(run.repository, "rev-parse", "HEAD")) !== run.head)
          throw Error("APPLICATION_UNCERTAIN");
        this.store.runs.update(projectId, run.id, {
          state: "applied",
          error: null,
        });
        this.store.runs.event(
          run.id,
          "application",
          "Approved changes applied successfully.",
        );
      } catch (error) {
        const head = await gitText(run.repository, "rev-parse", "HEAD").catch(
          () => "",
        );
        this.store.runs.update(projectId, run.id, {
          state:
            head === run.head
              ? "applied"
              : head === run.base
                ? "awaiting_review"
                : "apply_uncertain",
          error: head === run.head ? null : "APPLICATION_NOT_CONFIRMED",
        });
        throw Error("APPLICATION_NOT_CONFIRMED");
      }
    } finally {
      this.active.delete(run.repository);
    }
  }
}
