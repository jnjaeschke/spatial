import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Commit, Session, WorkflowId } from "../shared/types.ts";
import type { Store } from "./store.ts";
import type { GitCapability } from "./tasks.ts";
import { parseBlame } from "./blame.ts";

const run = promisify(execFile);
const MAX_BUFFER = 512 * 1024 * 1024;

async function git(repo: string, args: string[], env?: Record<string, string>): Promise<string> {
  const { stdout } = await run("git", ["-C", repo, "-c", "core.quotePath=false", ...args], { maxBuffer: MAX_BUFFER, encoding: "utf8", ...(env ? { env: { ...process.env, ...env } } : {}) });
  return stdout;
}

export interface PatchIdentity { name: string; email: string; /** Unix seconds. */ time: number }

/** Object-database writes for remote review. Not a `GitCapability`: tasks never get it. */
export interface GitWriter {
  /** Applies `rawDiff` onto the tree of `parent` in a temporary index and commits the result on top of `parent`. Writes only objects: the work tree, the index, HEAD and all refs are untouched. Deterministic for equal inputs. Rejects when the patch does not apply. Returns the new commit sha. */
  commitPatch(parent: string, rawDiff: string, message: string, identity: PatchIdentity): Promise<string>;
  /** Commits the work tree as it is now (staged, unstaged and untracked non-ignored changes, deletions included) on top of HEAD, built in a temporary index copied from the real one. Writes only objects: work tree, real index, HEAD and all refs are untouched. Returns the commit sha, or null when the resulting tree equals HEAD's tree. Rejects when HEAD does not exist. */
  snapshotWorktree(identity: PatchIdentity): Promise<string | null>;
  /** Points `ref` at `sha`. Rejects unless `ref` starts with `refs/spatial/`. */
  updateRef(ref: string, sha: string): Promise<void>;
}

export function makeGitWriter(repo: string): GitWriter {
  return {
    async snapshotWorktree(identity) {
      const dir = await mkdtemp(join(tmpdir(), "spatial-index-"));
      try {
        const env = { GIT_INDEX_FILE: join(dir, "index"), GIT_NO_LAZY_FETCH: "1" };
        const realIndex = (await git(repo, ["rev-parse", "--path-format=absolute", "--git-path", "index"])).trim();
        await copyFile(realIndex, env.GIT_INDEX_FILE);
        const head = (await git(repo, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
        await git(repo, ["add", "-A"], env);
        const tree = (await git(repo, ["write-tree"], env)).trim();
        if (tree === (await git(repo, ["rev-parse", `${head}^{tree}`])).trim()) return null;
        const when = `${identity.time} +0000`;
        const sha = await git(repo, ["-c", "commit.gpgsign=false", "commit-tree", tree, "-p", head, "-m", "Uncommitted changes"], {
          ...env,
          GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_AUTHOR_DATE: when,
          GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email, GIT_COMMITTER_DATE: when,
        });
        return sha.trim();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    async commitPatch(parent, rawDiff, message, identity) {
      const dir = await mkdtemp(join(tmpdir(), "spatial-index-"));
      try {
        const env = { GIT_INDEX_FILE: join(dir, "index"), GIT_NO_LAZY_FETCH: "1" };
        const patch = join(dir, "patch");
        await writeFile(patch, rawDiff);
        await git(repo, ["read-tree", parent], env);
        try {
          await git(repo, ["apply", "--cached", "--whitespace=nowarn", patch], env);
        } catch (e) {
          const stderr = (e as { stderr?: string }).stderr?.trim();
          throw new Error(`Patch does not apply on ${parent}: ${stderr || (e as Error).message}`);
        }
        const tree = (await git(repo, ["write-tree"], env)).trim();
        const when = `${identity.time} +0000`;
        const sha = await git(repo, ["-c", "commit.gpgsign=false", "commit-tree", tree, "-p", parent, "-m", message], {
          ...env,
          GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_AUTHOR_DATE: when,
          GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email, GIT_COMMITTER_DATE: when,
        });
        return sha.trim();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    async updateRef(ref, sha) {
      if (!/^refs\/spatial\/[^.]/.test(ref) || ref.includes("..")) throw new Error(`Refusing to write ${ref}: only refs/spatial/ is writable`);
      await git(repo, ["update-ref", ref, sha]);
    },
  };
}

export function makeGit(repo: string): GitCapability {
  return {
    effect: "read-only",
    async isDirty() {
      return (await git(repo, ["--no-optional-locks", "status", "--porcelain", "--untracked-files=normal"])).length > 0;
    },
    async resolve(rev) {
      try {
        return (await git(repo, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`])).trim();
      } catch {
        throw new Error(`Cannot resolve revision "${rev}" in ${repo}`);
      }
    },
    async isAncestor(ancestor, descendant) {
      try {
        await git(repo, ["merge-base", "--is-ancestor", ancestor, descendant]);
        return true;
      } catch (e) {
        if ((e as { code?: number }).code === 1) return false;
        throw e;
      }
    },
    async mergeBase(a, b) {
      try {
        await git(repo, ["rev-parse", "--verify", "--quiet", `${b}^{commit}`]);
      } catch {
        return null;
      }
      try {
        return (await git(repo, ["merge-base", a, b])).trim();
      } catch (e) {
        if ((e as { code?: number }).code === 1) return null;
        throw e;
      }
    },
    async log(baseSha, headSha) {
      const out = await git(repo, ["log", "--reverse", "--format=%H%x00%s%x00%b%x1e", `${baseSha}..${headSha}`]);
      return out.split("\x1e").map((r) => r.replace(/^\n/, "")).filter((r) => r.length > 0).map((r): Commit => {
        const [sha, subject, body] = r.split("\x00");
        return { sha, subject, body: body.trim() };
      });
    },
    async diff(baseSha, headSha) {
      return git(repo, ["diff", "--no-color", "--no-ext-diff", "-M", "-U3", baseSha, headSha]);
    },
    async blame(baseSha, rev, file, direction) {
      const args = ["blame", "--porcelain"];
      if (direction === "reverse") args.push("--reverse");
      args.push(`${baseSha}..${rev}`, "--", file);
      return parseBlame(await git(repo, args), file);
    },
    async replay(oldBase, newBase, oldHead) {
      let out: string;
      try {
        out = await git(repo, ["merge-tree", "--write-tree", "--name-only", "--no-messages", "-z", `--merge-base=${oldBase}`, newBase, oldHead]);
      } catch (e) {
        if ((e as { code?: number }).code !== 1) throw e;
        out = (e as { stdout: string }).stdout;
      }
      const [tree, ...paths] = out.split("\0");
      return { tree: tree!, conflicts: paths.filter((path) => path !== "") };
    },
    async show(sha, path) {
      try {
        return await git(repo, ["show", `${sha}:${path}`]);
      } catch {
        throw new Error(`Cannot read ${path} at ${sha}`);
      }
    },
  };
}

/** Worktree toplevel and repo identity of `path`. Throws `Not a git repository` outside a work tree (bare repos included). */
export async function resolveRepo(path: string): Promise<{ worktree: string; repoDir: string }> {
  let out: string;
  try {
    out = await git(path, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"]);
  } catch {
    throw new Error(`Not a git repository: ${path}`);
  }
  const [worktree, commonDir] = out.trim().split("\n");
  if (!worktree || !commonDir) throw new Error(`Not a git repository: ${path}`);
  return { worktree, repoDir: realpathSync(commonDir) };
}

/** Creates a session in the worktree containing `path`. */
export async function createSession(store: Store, repo: string, title: string, workflow: WorkflowId | null): Promise<Session> {
  return store.createSession({ ...(await resolveRepo(repo)), title, ...(workflow ? { workflow } : {}) });
}
