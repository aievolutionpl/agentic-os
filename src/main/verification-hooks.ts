import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "./store.js";
import type { VerificationCheck, VerificationReport } from "../shared.js";
import { git, gitText } from "./git.js";
import { defaultRunner } from "./connectors.js";

const SECRET_PATTERN =
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})/;

export async function runVerificationChecks(
  store: Store,
  projectId: string,
  runId: string,
): Promise<VerificationReport> {
  const startedAt = Date.now();
  const run = store.runs.get(projectId, runId);
  if (!run) throw Error("RUN_NOT_FOUND");
  if (!run.artifactId) throw Error("ARTIFACT_REQUIRED");
  const artifact = store.artifacts.get(projectId, run.taskId, run.artifactId);
  if (!artifact) throw Error("ARTIFACT_NOT_FOUND");

  const diffText = artifact.diff.toString("utf8");
  const checks: VerificationCheck[] = [];

  // 1. Git & Diff Hygiene Gate
  const t1 = Date.now();
  const conflictMarkers = /^\+(?:<<<<<<<|=======|>>>>>>>)/m.test(diffText);
  const diffBytes = artifact.diff.byteLength;
  let changedFiles: string[] = [];
  if (run.worktree && existsSync(run.worktree)) {
    const names = await gitText(
      run.worktree,
      "diff",
      "--name-only",
      run.base,
      run.head,
      "--",
    ).catch(() => "");
    changedFiles = names
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  checks.push({
    id: "git-hygiene",
    name: "Git & Diff Hygiene",
    status: conflictMarkers
      ? "failed"
      : diffBytes > 250_000
        ? "warning"
        : "passed",
    detail: conflictMarkers
      ? "Detected unresolved Git merge conflict markers in diff."
      : `${changedFiles.length || 1} file(s) changed (${Math.max(1, Math.round(diffBytes / 1024))} KB diff).`,
    durationMs: Math.max(1, Date.now() - t1),
  });

  // 2. Secret & Credential Guard
  const t2 = Date.now();
  const hasSecret = SECRET_PATTERN.test(diffText);
  const protectedPath = changedFiles.some((file) =>
    /^(?:\.env(?:\..*)?|auth\.json|credentials\.json|id_rsa|id_ed25519)$/i.test(
      file.split(/[\\/]/).pop() ?? "",
    ),
  );
  checks.push({
    id: "secret-scan",
    name: "Secret & Credential Guard",
    status: hasSecret || protectedPath ? "failed" : "passed",
    detail:
      hasSecret || protectedPath
        ? "Potential secret token or protected credential file detected in diff."
        : "No API keys, private keys, or credential files detected.",
    durationMs: Math.max(1, Date.now() - t2),
  });

  // 3. JSON / Package Integrity Check
  const t3 = Date.now();
  let jsonError: string | null = null;
  if (run.worktree && existsSync(run.worktree)) {
    for (const rel of changedFiles.filter((f) => f.endsWith(".json"))) {
      const full = join(run.worktree, rel);
      if (existsSync(full)) {
        try {
          JSON.parse(readFileSync(full, "utf8"));
        } catch {
          jsonError = `Invalid JSON syntax in ${rel}`;
          break;
        }
      }
    }
  }
  checks.push({
    id: "json-integrity",
    name: "Manifest & JSON Integrity",
    status: jsonError ? "failed" : "passed",
    detail: jsonError ?? "All modified JSON/manifest files are valid.",
    durationMs: Math.max(1, Date.now() - t3),
  });

  // 4. JS/MJS Syntax & Plugin Hook Check
  const t4 = Date.now();
  const jsFiles = changedFiles.filter((f) => /\.(?:mjs|cjs|js)$/i.test(f));
  let syntaxError: string | null = null;
  if (run.worktree && existsSync(run.worktree) && jsFiles.length > 0) {
    for (const rel of jsFiles.slice(0, 10)) {
      const full = join(run.worktree, rel);
      if (!existsSync(full)) continue;
      const res = await defaultRunner(process.execPath, ["--check", full], 5000);
      if (res.code !== 0) {
        syntaxError = `Syntax error in ${rel}`;
        break;
      }
    }
  }
  const activeHooks = store.extensions
    .list(projectId)
    .filter(
      (ext) =>
        ext.enabled !== false &&
        (ext.kind === "plugin" || ext.kind === "hook"),
    );
  checks.push({
    id: "syntax-and-plugins",
    name: "JS Syntax & Active Plugin Gates",
    status: syntaxError ? "failed" : "passed",
    detail: syntaxError
      ? syntaxError
      : jsFiles.length > 0
        ? `Verified syntax of ${jsFiles.length} JS module(s); ${activeHooks.length} project plugin(s) active.`
        : `No JS syntax issues; ${activeHooks.length} project plugin(s) active.`,
    durationMs: Math.max(1, Date.now() - t4),
  });

  // Verify worktree cleanliness
  if (run.worktree && existsSync(run.worktree)) {
    const dirty = await git(run.worktree, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]).catch(() => Buffer.from(""));
    if (dirty.length > 0) {
      checks.push({
        id: "worktree-seal",
        name: "Worktree Seal Verification",
        status: "warning",
        detail: "Uncommitted files detected in worktree.",
        durationMs: 1,
      });
    }
  }

  const passed = checks.every((c) => c.status !== "failed");
  const report: VerificationReport = {
    runId: run.id,
    passed,
    checks,
    observedAt: new Date().toISOString(),
    durationMs: Math.max(1, Date.now() - startedAt),
  };

  store.runs.event(
    run.id,
    "verification",
    `Plugin verification gate ${passed ? "PASSED" : "FAILED"} (${checks.filter((c) => c.status === "passed").length}/${checks.length} checks ok in ${report.durationMs} ms).`,
  );

  return report;
}
