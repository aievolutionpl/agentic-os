import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpathSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { inputObject } from './lifecycle.js';

const exec = promisify(execFile);
// The native Windows resolver expands DOS 8.3 aliases as well as junctions.
// Compare canonical paths without lowercasing case-sensitive directories.
const canonicalPath = realpathSync.native;
const limit = 10 * 1024 * 1024;
function label(v: unknown): string {
  if (typeof v !== 'string' || !v.trim() || v.includes('\0') || v.length > 4096) throw Error('INVALID_INPUT');
  return v;
}
// Read-only Git plumbing. No shell, hooks, external diff or text conversion.
async function git(cwd: string, ...args: string[]): Promise<Buffer> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  try {
    return (await exec('git', ['--no-pager', ...args], {
      cwd, timeout: 5000, maxBuffer: limit, encoding: 'buffer',
      env: { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_COUNT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' },
    })).stdout;
  } catch { throw Error('ARTIFACT_GIT_FAILED'); }
}
export class Artifacts {
  constructor(private db: DatabaseSync, private clock: () => number) {}
  migrate() {
    this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE diff_artifacts(
        id TEXT PRIMARY KEY, projectId TEXT NOT NULL, taskId TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK(attempt BETWEEN 0 AND 3),
        repository TEXT NOT NULL, worktree TEXT NOT NULL,
        base TEXT NOT NULL, target TEXT NOT NULL,
        diff BLOB NOT NULL CHECK(length(diff)>0 AND length(diff)<=10485760),
        diffHash TEXT NOT NULL CHECK(length(diffHash)=64 AND diffHash NOT GLOB '*[^0-9a-f]*'),
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(projectId,taskId) REFERENCES tasks(projectId,id));
      CREATE TRIGGER artifact_no_update BEFORE UPDATE ON diff_artifacts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_ARTIFACT'); END;
      CREATE TRIGGER artifact_no_delete BEFORE DELETE ON diff_artifacts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_ARTIFACT'); END;
      PRAGMA user_version=4; COMMIT;`);
  }
  async capture(input: unknown) {
    const p = inputObject(input);
    if (Object.keys(p).some(k => !['projectId','taskId','attempt','worktree','base','target'].includes(k))) throw Error('INVALID_INPUT');
    const projectId = label(p.projectId), taskId = label(p.taskId);
    if (!Number.isInteger(p.attempt) || Number(p.attempt)<0 || Number(p.attempt)>3) throw Error('INVALID_INPUT');
    const attempt = Number(p.attempt), requestedWorktree = label(p.worktree), base = label(p.base), target = label(p.target);
    const task = this.db.prepare('SELECT p.root FROM tasks t JOIN projects p ON p.id=t.projectId WHERE t.projectId=? AND t.id=? AND t.attempt=?').get(projectId,taskId,attempt);
    if (!task) throw Error('TASK_ATTEMPT_NOT_FOUND');
    const worktree = canonicalPath(requestedWorktree);
    const repository = canonicalPath(label(task.root));
    const read = async (cwd: string,...args: string[]) => (await git(cwd,...args)).toString('utf8').trim();
    const common = async (cwd: string) => canonicalPath(await read(cwd,'rev-parse','--path-format=absolute','--git-common-dir'));
    const gitDir = canonicalPath(await read(worktree,'rev-parse','--absolute-git-dir'));
    if ((await common(repository))!==(await common(worktree)) || gitDir===(await common(worktree)) ||
        canonicalPath(await read(worktree,'rev-parse','--show-toplevel'))!==worktree || worktree===repository) throw Error('NOT_ISOLATED_WORKTREE');
    for (const oid of [base,target]) {
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid) || (await read(worktree,'rev-parse','--verify',`${oid}^{commit}`))!==oid) throw Error('INVALID_COMMIT');
    }
    const stable = async () => {
      if ((await read(worktree,'rev-parse','HEAD'))!==target || (await git(worktree,'status','--porcelain=v1','--untracked-files=all','--ignore-submodules=none')).length) throw Error('WORKTREE_CHANGED');
    };
    await stable();
    // Only immutable committed trees are captured; index/worktree/untracked changes are rejected.
    const diff = await git(worktree,'-c','core.quotePath=true','diff','--no-ext-diff','--no-textconv','--binary','--full-index','--no-color','--no-renames','--diff-algorithm=myers','--no-indent-heuristic','--unified=3','--inter-hunk-context=0','--no-relative','--output-indicator-new=+','--output-indicator-old=-','--output-indicator-context= ','--src-prefix=a/','--dst-prefix=b/','--ignore-submodules=none','--submodule=short',base,target,'--');
    if (!diff.length || diff.length>limit) throw Error('INVALID_DIFF');
    await stable();
    const id = randomUUID(), diffHash = createHash('sha256').update(diff).digest('hex'), createdAt = this.clock();
    const result = this.db.prepare(`INSERT INTO diff_artifacts SELECT ?,projectId,id,?,?,?,?,?,?,?,? FROM tasks WHERE projectId=? AND id=? AND attempt=?`)
      .run(id,attempt,repository,worktree,base,target,diff,diffHash,createdAt,projectId,taskId,attempt);
    if (!result.changes) throw Error('TASK_ATTEMPT_NOT_FOUND');
    return this.get(projectId,taskId,id)!;
  }
  get(projectId: unknown,taskId: unknown,id: unknown) {
    const row = this.db.prepare('SELECT * FROM diff_artifacts WHERE projectId=? AND taskId=? AND id=?').get(label(projectId),label(taskId),label(id));
    return row ? {...row,diff:Buffer.from(row.diff as Uint8Array)} : null;
  }
}
