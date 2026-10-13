import { copyFile, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localMainline, remoteDefaultRef, statusLines } from "./read.ts";
import { gitMessage, runGit } from "./run.ts";

export interface PatchIdentity { name: string; email: string; /** Unix seconds. */ time: number }

/** Object-database writes for remote review. Not a `GitCapability`: tasks never get it. */
export interface GitWriter {
  /** Current branch name; null on a detached HEAD. */
  currentBranch(): Promise<string | null>;
  /** Number of paths with staged, unstaged or untracked (non-ignored) changes. */
  changedFiles(): Promise<number>;
  /** Paths with staged, unstaged or untracked changes (renames report the new path). */
  changedPaths(): Promise<string[]>;
  /** Stages everything and commits it with `message`; returns the new commit's sha. */
  commitAll(message: string): Promise<string>;
  /** Stages everything, commits it as `--fixup=<target>` and autosquashes `base..HEAD`. On a conflict it aborts the rebase, drops the fixup commit (the edits stay in the work tree) and rejects. */
  fixup(target: string, base: string): Promise<string>;
  /** `git fetch <remote>`; rejects with git's message. */
  fetch(remote: string): Promise<void>;
  /** The commit new work starts from. With an `origin` remote: fetches it and resolves the target of `origin/HEAD`, or of `git ls-remote --symref origin HEAD` when that is unset. Without: the local `main`, else `master`. Rejects when none exists. */
  defaultBase(): Promise<{ ref: string; sha: string }>;
  branchExists(name: string): Promise<boolean>;
  /** `git switch -c <name> <base>`; uncommitted changes move along. */
  createBranch(name: string, base: string): Promise<void>;
  /** Applies `rawDiff` onto the tree of `parent` in a temporary index and commits the result on top of `parent`. Writes only objects: the work tree, the index, HEAD and all refs are untouched. Deterministic for equal inputs. Rejects when the patch does not apply. Returns the new commit sha. */
  commitPatch(parent: string, rawDiff: string, message: string, identity: PatchIdentity): Promise<string>;
  /** Commits the work tree as it is now (staged, unstaged and untracked non-ignored changes, deletions included) on top of HEAD, built in a temporary index copied from the real one. Writes only objects: work tree, real index, HEAD and all refs are untouched. Returns the commit sha, or null when the resulting tree equals HEAD's tree. Rejects when HEAD does not exist. */
  snapshotWorktree(identity: PatchIdentity): Promise<string | null>;
  /** Points `ref` at `sha`. Rejects unless `ref` starts with `refs/spatial/`. */
  updateRef(ref: string, sha: string): Promise<void>;
}

/** Runs `body` with an environment whose `GIT_INDEX_FILE` is a fresh path in a temporary directory, removed afterwards. */
async function withTempIndex<T>(body: (env: { GIT_INDEX_FILE: string; GIT_NO_LAZY_FETCH: string }, dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "spatial-index-"));
  try { return await body({ GIT_INDEX_FILE: join(dir, "index"), GIT_NO_LAZY_FETCH: "1" }, dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

/** Writes a commit of `tree` on `parent` with a fixed identity and date, without touching HEAD or any ref. */
async function commitTree(repo: string, env: Record<string, string>, tree: string, parent: string, message: string, identity: PatchIdentity): Promise<string> {
  const when = `${identity.time} +0000`;
  const sha = await runGit(repo, ["-c", "commit.gpgsign=false", "commit-tree", tree, "-p", parent, "-m", message], { env: {
    ...env,
    GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_AUTHOR_DATE: when,
    GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email, GIT_COMMITTER_DATE: when,
  } });
  return sha.trim();
}

export function makeGitWriter(repo: string): GitWriter {
  const git = (args: string[], env?: Record<string, string>) => runGit(repo, args, env ? { env } : {});
  return {
    async currentBranch() {
      try { return (await git(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim(); }
      catch { return null; }
    },
    async changedFiles() {
      return (await statusLines(repo)).length;
    },
    async changedPaths() {
      const entries = (await git(["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all"])).split("\0").filter(Boolean);
      const paths: string[] = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        paths.push(entry.slice(3));
        if (entry[0] === "R" || entry[0] === "C") i++;
      }
      return paths;
    },
    async commitAll(message) {
      await git(["add", "-A"]);
      await git(["commit", "-q", "-m", message]);
      return (await git(["rev-parse", "HEAD"])).trim();
    },
    async fixup(target, base) {
      await git(["add", "-A"]);
      await git(["commit", "-q", `--fixup=${target}`]);
      try { await git(["rebase", "-i", "--autosquash", base], { GIT_SEQUENCE_EDITOR: "true" }); }
      catch (e) {
        await git(["rebase", "--abort"]).catch(() => undefined);
        await git(["reset", "-q", "HEAD~1"]);
        throw new Error(`Autosquash failed: ${gitMessage(e)}`);
      }
      return (await git(["rev-parse", "HEAD"])).trim();
    },
    async fetch(remote) {
      try { await git(["fetch", "--quiet", remote]); }
      catch (e) { throw new Error(`git fetch ${remote} failed: ${gitMessage(e)}`); }
    },
    async defaultBase() {
      const remotes = (await git(["remote"])).split("\n").filter(Boolean);
      if (remotes.includes("origin")) {
        await this.fetch("origin");
        let branch = (await remoteDefaultRef(repo))?.replace(/^refs\/remotes\/origin\//, "");
        if (!branch) {
          const found = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(await git(["ls-remote", "--symref", "origin", "HEAD"]));
          if (!found) throw new Error("Cannot determine the default branch of origin");
          branch = found[1]!;
        }
        const ref = `origin/${branch}`;
        return { ref, sha: (await git(["rev-parse", "--verify", `${ref}^{commit}`])).trim() };
      }
      const local = await localMainline(repo);
      if (!local) throw new Error("no origin remote and no local main or master branch");
      return { ref: local.ref.slice("refs/heads/".length), sha: local.sha };
    },
    async branchExists(name) {
      try { await git(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]); return true; }
      catch { return false; }
    },
    async createBranch(name, base) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name) || name.includes("..")) throw new Error(`Invalid branch name: ${name}`);
      try { await git(["switch", "-c", name, base]); }
      catch (e) { throw new Error(`git switch -c ${name} failed: ${gitMessage(e)}`); }
    },
    async snapshotWorktree(identity) {
      return withTempIndex(async (env) => {
        const realIndex = (await git(["rev-parse", "--path-format=absolute", "--git-path", "index"])).trim();
        await copyFile(realIndex, env.GIT_INDEX_FILE);
        // Git re-reads entries not older than the index file; a fresh mtime on the copy would make it trust stale stat data.
        const { atime, mtime } = await stat(realIndex);
        await utimes(env.GIT_INDEX_FILE, atime, mtime);
        const head = (await git(["rev-parse", "--verify", "HEAD^{commit}"])).trim();
        await git(["add", "-A"], env);
        const tree = (await git(["write-tree"], env)).trim();
        if (tree === (await git(["rev-parse", `${head}^{tree}`])).trim()) return null;
        return commitTree(repo, env, tree, head, "Uncommitted changes", identity);
      });
    },
    async commitPatch(parent, rawDiff, message, identity) {
      return withTempIndex(async (env, dir) => {
        const patch = join(dir, "patch");
        await writeFile(patch, rawDiff);
        await git(["read-tree", parent], env);
        try { await git(["apply", "--cached", "--whitespace=nowarn", patch], env); }
        catch (e) { throw new Error(`Patch does not apply on ${parent}: ${gitMessage(e)}`); }
        const tree = (await git(["write-tree"], env)).trim();
        return commitTree(repo, env, tree, parent, message, identity);
      });
    },
    async updateRef(ref, sha) {
      if (!/^refs\/spatial\/[^.]/.test(ref) || ref.includes("..")) throw new Error(`Refusing to write ${ref}: only refs/spatial/ is writable`);
      await git(["update-ref", ref, sha]);
    },
  };
}
