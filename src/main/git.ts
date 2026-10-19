import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpathSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { randomUUID } from "node:crypto";
const exec = promisify(execFile);
export const canonical = (path: string) => realpathSync.native(path);
const nullPath = process.platform === "win32" ? "NUL" : "/dev/null";
export async function git(cwd: string, args: string[]): Promise<Buffer> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  const common = [
    "--no-pager",
    "-c",
    `core.hooksPath=${nullPath}`,
    "-c",
    "core.fsmonitor=false",
    "-c",
    "commit.gpgSign=false",
    "-c",
    "core.autocrlf=false",
    "-c",
    "core.protectNTFS=true",
  ];
  const run = (options: string[]) =>
    exec("git", [...common, ...options], {
      cwd,
      env: {
        ...env,
        GIT_NO_REPLACE_OBJECTS: "1",
        GIT_CONFIG_COUNT: "0",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: nullPath,
        GIT_TERMINAL_PROMPT: "0",
        GIT_AUTHOR_NAME: "Agenting OS",
        GIT_AUTHOR_EMAIL: "agenting-os@localhost",
        GIT_COMMITTER_NAME: "Agenting OS",
        GIT_COMMITTER_EMAIL: "agenting-os@localhost",
      },
      encoding: "buffer",
      timeout: 30000,
      maxBuffer: 12 * 1024 * 1024,
    });
  // Never execute repository-defined clean/smudge/process filters during Git operations.
  const filters =
    args[0] === "init"
      ? []
      : await run([
          "config",
          "--local",
          "--name-only",
          "--get-regexp",
          "^filter\\..*\\.(clean|smudge|process|required)$",
        ]).then(
          (r) => r.stdout.toString().trim().split(/\r?\n/).filter(Boolean),
          (error) => {
            if (error.code === 1) return [];
            throw error;
          },
        );
  const overrides = filters.flatMap((name) => [
    "-c",
    `${name}=${name.endsWith(".required") ? "false" : ""}`,
  ]);
  return (await run([...overrides, ...args])).stdout;
}
export const gitText = async (cwd: string, ...args: string[]) =>
  (await git(cwd, args)).toString("utf8").trim();
export interface Workspace {
  repository: string;
  path: string;
  base: string;
  head: string;
}
export class Worktrees {
  readonly root: string;
  constructor(root: string) {
    mkdirSync(root, { recursive: true });
    this.root = canonical(root);
  }
  async inspect(repository: string) {
    const path = canonical(repository);
    if (canonical(await gitText(path, "rev-parse", "--show-toplevel")) !== path)
      throw Error("PROJECT_ROOT_MUST_BE_REPOSITORY");
    if (
      (
        await git(path, [
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
          "--ignore-submodules=none",
        ])
      ).length
    )
      throw Error("REPOSITORY_NOT_CLEAN");
    return {
      repository: path,
      base: await gitText(path, "rev-parse", "--verify", "HEAD^{commit}"),
    };
  }
  async create(repository: string): Promise<Workspace> {
    const source = await this.inspect(repository);
    const path = resolve(this.root, randomUUID());
    if (!path.startsWith(this.root + sep) || existsSync(path))
      throw Error("INVALID_WORKTREE");
    await git(source.repository, [
      "worktree",
      "add",
      "--detach",
      "--no-checkout",
      path,
      source.base,
    ]);
    await git(path, ["read-tree", "--reset", "-u", source.base]);
    const workspace = { ...source, path: canonical(path), head: source.base };
    await this.verify(workspace);
    return workspace;
  }
  async verify(workspace: Workspace) {
    const path = canonical(workspace.path);
    if (
      !path.startsWith(this.root + sep) ||
      path === canonical(workspace.repository)
    )
      throw Error("INVALID_WORKTREE");
    const common = async (cwd: string) =>
      canonical(
        await gitText(
          cwd,
          "rev-parse",
          "--path-format=absolute",
          "--git-common-dir",
        ),
      );
    if (
      (await common(path)) !== (await common(workspace.repository)) ||
      canonical(await gitText(path, "rev-parse", "--absolute-git-dir")) ===
        (await common(path)) ||
      canonical(await gitText(path, "rev-parse", "--show-toplevel")) !== path
    )
      throw Error("INVALID_WORKTREE");
  }
  async seal(workspace: Workspace): Promise<string> {
    await this.verify(workspace);
    if ((await gitText(workspace.path, "rev-parse", "HEAD")) !== workspace.base)
      throw Error("WORKTREE_HEAD_CHANGED");
    await git(workspace.path, ["add", "--all", "--", "."]);
    const names = await git(workspace.path, [
      "diff",
      "--cached",
      "--name-only",
      "-z",
      "--",
    ]);
    if (!names.length) return workspace.base;
    if (names.length > 1024 * 1024) throw Error("CHANGE_LIMIT_EXCEEDED");
    const tree = await gitText(workspace.path, "write-tree");
    const head = await gitText(
      workspace.path,
      "commit-tree",
      tree,
      "-p",
      workspace.base,
      "-m",
      "Agenting OS isolated task result",
    );
    await git(workspace.path, ["update-ref", "HEAD", head, workspace.base]);
    return head;
  }
}
