import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { copyFile, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Commit, Session, WorkflowId } from "../shared/types.ts";
import type { Store } from "./store.ts";
import type { GitCapability } from "./tasks.ts";
import { parseBlame } from "./blame.ts";
import { capOutput } from "./process.ts";

const run = promisify(execFile);
const MAX_BUFFER = 512 * 1024 * 1024;
/** Most a session MCP tool answers with, so one answer cannot flood the LLM's context. */
export const MAX_TOOL_OUTPUT = 64 * 1024;

const capScmOutput = (output: string) => capOutput(output, MAX_TOOL_OUTPUT);

export function safeRepoPath(path: string): string {
  if (!path || path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(path) || path.split(/[\\/]/).includes("..")) throw new Error(`Invalid path: ${path}`);
  return path;
}

/** Keeps whole lines within the SCM output cap; returns how many lines fit. */
function capWholeLines(lines: string[]): { text: string; kept: number } {
  let length = 0;
  for (let index = 0; index < lines.length; index++) {
    length += lines[index]!.length + 1;
    if (length > MAX_TOOL_OUTPUT - 100) return { text: lines.slice(0, index).join("\n"), kept: index };
  }
  return { text: lines.join("\n"), kept: lines.length };
}

export function safeRevision(value: string, name: string): string {
  if (!value || value.startsWith("-")) throw new Error(`Invalid ${name}: ${value}`);
  return value;
}

/** Read-only SCM summaries for an agent working in this repository. */
export async function scmStatus(repo: string): Promise<string> {
  let branch: string;
  try { branch = (await git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim(); }
  catch { branch = (await git(repo, ["rev-parse", "--short", "HEAD"])).trim() + " (detached HEAD)"; }
  let upstream = "";
  try { upstream = (await git(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])).trim(); }
  catch { /* An upstream is optional. */ }
  const lines = (await git(repo, ["--no-optional-locks", "status", "--porcelain", "--untracked-files=normal"])).trimEnd().split("\n").filter(Boolean).slice(0, 200);
  return capScmOutput([`Branch: ${branch}`, ...(upstream ? [`Upstream: ${upstream}`] : []), lines.length ? "Changes:" : "Working tree clean.", ...lines].join("\n"));
}

export async function scmBranches(repo: string): Promise<string> {
  const out = await git(repo, ["for-each-ref", "--format=%(refname:short)%00%(objectname:short)%00%(upstream:short)%00%(subject)", "refs/heads"]);
  const rows = out.trimEnd().split("\n").filter(Boolean).slice(0, 200);
  return capScmOutput(rows.length ? rows.map((row) => { const [name, sha, upstream, subject] = row.split("\0"); return `${name} ${sha}${upstream ? ` [${upstream}]` : ""} ${subject}`; }).join("\n") : "No local branches.");
}

/** History searches over a large repository can take minutes; past this they fail instead of blocking the agent. */
const SCM_SEARCH_TIMEOUT_MS = 120_000;

/** `search` and `regex` select commits whose diff changes the number of occurrences of a string (`git log -S`) or touches a line matching a regex (`git log -G`). */
export async function scmLog(repo: string, range: string, opts: { limit?: number; path?: string; search?: string; regex?: string } = {}): Promise<string> {
  safeRevision(range, "range");
  const args = ["log", `-${Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 500)}`, "--abbrev=12", "--format=%h %as %an: %s"];
  // Attached to their flag, so a value starting with "-" is never read as an option.
  if (opts.search !== undefined) args.push(`-S${opts.search}`);
  if (opts.regex !== undefined) args.push(`-G${opts.regex}`);
  args.push("--end-of-options", range);
  if (opts.path !== undefined) args.push("--", safeRepoPath(opts.path));
  const out = await git(repo, args, undefined, opts.search !== undefined || opts.regex !== undefined ? SCM_SEARCH_TIMEOUT_MS : undefined);
  return capScmOutput(out.trimEnd() || "No commits.");
}

/** Who last changed each line of `path` at `rev`: `sha date author line: text`, at most 400 lines. */
export async function scmBlame(repo: string, rev: string, path: string, start: number, end: number): Promise<string> {
  safeRevision(rev, "revision");
  safeRepoPath(path);
  if (!Number.isInteger(start) || start < 1 || !Number.isInteger(end) || end < start) throw new Error("Invalid line range");
  const out = await git(repo, ["blame", "--line-porcelain", "-L", `${start},${Math.min(end, start + 399)}`, rev, "--", path], undefined, SCM_SEARCH_TIMEOUT_MS);
  const rows: string[] = [];
  let sha = "", author = "", time = 0, line = 0;
  for (const row of out.split("\n")) {
    const header = /^([0-9a-f]{40}) \d+ (\d+)/.exec(row);
    if (header) { sha = header[1]!; line = Number(header[2]); continue; }
    if (row.startsWith("author ")) author = row.slice("author ".length);
    else if (row.startsWith("author-time ")) time = Number(row.slice("author-time ".length));
    else if (row.startsWith("\t")) rows.push(`${sha.slice(0, 12)} ${new Date(time * 1000).toISOString().slice(0, 10)} ${author} ${line}: ${row.slice(1)}`);
  }
  return capWholeLines(rows).text;
}

export async function scmMergeBase(repo: string, a: string, b: string): Promise<string> {
  safeRevision(a, "revision"); safeRevision(b, "revision");
  try { return (await git(repo, ["merge-base", "--end-of-options", a, b])).trim(); }
  catch (error) { if ((error as { code?: number }).code === 1) return "none"; throw error; }
}

export async function scmShow(repo: string, rev: string): Promise<string> {
  safeRevision(rev, "revision");
  return capScmOutput((await git(repo, ["show", "--no-patch", "--format=commit %H%nAuthor: %an <%ae>%nDate: %aI%n%n%B", "--stat", "--end-of-options", rev])).trimEnd());
}

export async function scmDiff(repo: string, rev: string, path?: string): Promise<string> {
  safeRevision(rev, "revision");
  const args = ["show", "--format=", "-U5", "--end-of-options", rev];
  if (path !== undefined) args.push("--", safeRepoPath(path));
  const lines = (await git(repo, args)).trimEnd().split("\n");
  const { text, kept } = capWholeLines(lines);
  return kept < lines.length ? `${text}\n[diff truncated at a whole line]` : text;
}

export async function scmRangeDiff(repo: string, a: string, b: string, path?: string): Promise<string> {
  safeRevision(a, "revision"); safeRevision(b, "revision");
  const args = ["diff", "--no-color", "--no-ext-diff", "-M", "-U5", "--end-of-options", a, b];
  if (path !== undefined) args.push("--", safeRepoPath(path));
  const lines = (await git(repo, args)).trimEnd().split("\n");
  const { text, kept } = capWholeLines(lines);
  return kept < lines.length ? `${text}\n[diff truncated at a whole line]` : text || "No differences.";
}

export async function scmFile(repo: string, rev: string, path: string, start = 1, end?: number): Promise<string> {
  safeRevision(rev, "revision");
  safeRepoPath(path);
  const lines = (await git(repo, ["show", "--end-of-options", `${rev}:${path}`])).replace(/\n$/, "").split(/\r?\n/);
  if (!Number.isInteger(start) || start < 1 || start > lines.length || (end !== undefined && (!Number.isInteger(end) || end < start))) throw new Error(`Invalid line range for a file of ${lines.length} lines`);
  const stop = Math.min(end ?? lines.length, start + 399, lines.length);
  const { text, kept } = capWholeLines(lines.slice(start - 1, stop).map((line, index) => `${start + index}: ${line}`));
  const next = start + kept;
  return next <= Math.min(end ?? lines.length, lines.length) ? `${text}\n[more lines available; request from line ${next}]` : text;
}

async function git(repo: string, args: string[], env?: Record<string, string>, timeout?: number): Promise<string> {
  const { stdout } = await run("git", ["-C", repo, "-c", "core.quotePath=false", ...args], { maxBuffer: MAX_BUFFER, encoding: "utf8", ...(env ? { env: { ...process.env, ...env } } : {}), ...(timeout ? { timeout } : {}) });
  return stdout;
}

/** Runs git in `repo` with the settings every read here uses; resolves with stdout and rejects with git's error. */
export const runGit = git;

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

export function makeGitWriter(repo: string): GitWriter {
  return {
    async currentBranch() {
      try { return (await git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim(); }
      catch { return null; }
    },
    async changedFiles() {
      return (await git(repo, ["--no-optional-locks", "status", "--porcelain", "--untracked-files=normal"])).split("\n").filter(Boolean).length;
    },
    async changedPaths() {
      const entries = (await git(repo, ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all"])).split("\0").filter(Boolean);
      const paths: string[] = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        paths.push(entry.slice(3));
        if (entry[0] === "R" || entry[0] === "C") i++;
      }
      return paths;
    },
    async commitAll(message) {
      await git(repo, ["add", "-A"]);
      await git(repo, ["commit", "-q", "-m", message]);
      return (await git(repo, ["rev-parse", "HEAD"])).trim();
    },
    async fixup(target, base) {
      await git(repo, ["add", "-A"]);
      await git(repo, ["commit", "-q", `--fixup=${target}`]);
      try { await git(repo, ["rebase", "-i", "--autosquash", base], { GIT_SEQUENCE_EDITOR: "true" }); }
      catch (e) {
        await git(repo, ["rebase", "--abort"]).catch(() => undefined);
        await git(repo, ["reset", "-q", "HEAD~1"]);
        throw new Error(`Autosquash failed: ${((e as { stderr?: string }).stderr || (e as Error).message).trim()}`);
      }
      return (await git(repo, ["rev-parse", "HEAD"])).trim();
    },
    async fetch(remote) {
      try { await git(repo, ["fetch", "--quiet", remote]); }
      catch (e) { throw new Error(`git fetch ${remote} failed: ${((e as { stderr?: string }).stderr || (e as Error).message).trim()}`); }
    },
    async defaultBase() {
      const remotes = (await git(repo, ["remote"])).split("\n").filter(Boolean);
      if (remotes.includes("origin")) {
        await this.fetch("origin");
        let branch: string;
        try { branch = (await git(repo, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])).trim().replace(/^origin\//, ""); }
        catch {
          const found = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(await git(repo, ["ls-remote", "--symref", "origin", "HEAD"]));
          if (!found) throw new Error("Cannot determine the default branch of origin");
          branch = found[1]!;
        }
        const ref = `origin/${branch}`;
        return { ref, sha: (await git(repo, ["rev-parse", "--verify", `${ref}^{commit}`])).trim() };
      }
      for (const name of ["main", "master"]) {
        try { return { ref: name, sha: (await git(repo, ["rev-parse", "--verify", `refs/heads/${name}^{commit}`])).trim() }; }
        catch { /* try the next name */ }
      }
      throw new Error("no origin remote and no local main or master branch");
    },
    async branchExists(name) {
      try { await git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]); return true; }
      catch { return false; }
    },
    async createBranch(name, base) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name) || name.includes("..")) throw new Error(`Invalid branch name: ${name}`);
      try { await git(repo, ["switch", "-c", name, base]); }
      catch (e) { throw new Error(`git switch -c ${name} failed: ${((e as { stderr?: string }).stderr || (e as Error).message).trim()}`); }
    },
    async snapshotWorktree(identity) {
      const dir = await mkdtemp(join(tmpdir(), "spatial-index-"));
      try {
        const env = { GIT_INDEX_FILE: join(dir, "index"), GIT_NO_LAZY_FETCH: "1" };
        const realIndex = (await git(repo, ["rev-parse", "--path-format=absolute", "--git-path", "index"])).trim();
        await copyFile(realIndex, env.GIT_INDEX_FILE);
        // Git re-reads entries not older than the index file; a fresh mtime on the copy would make it trust stale stat data.
        const { atime, mtime } = await stat(realIndex);
        await utimes(env.GIT_INDEX_FILE, atime, mtime);
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
    async mainlineRefs() {
      const out = await git(repo, ["for-each-ref", "--format=%(refname)", "refs/heads/main", "refs/heads/master", "refs/remotes/*/main", "refs/remotes/*/master"]);
      return out.split("\n").filter(Boolean);
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
    async wordsAt(rev, words) {
      if (!words.length) return new Set();
      safeRevision(rev, "revision");
      const dir = await mkdtemp(join(tmpdir(), "spatial-words-"));
      try {
        const file = join(dir, "words");
        const found = new Set<string>();
        // `-m 1` keeps the output small (common words match in nearly every file) but hides words after a file's first matching line, so repeat with the words not yet found until a round finds none.
        for (let pending = words; pending.length; pending = pending.filter((word) => !found.has(word))) {
          await writeFile(file, pending.join("\n") + "\n");
          let out: string;
          try {
            out = await git(repo, ["grep", "-o", "-h", "-w", "-I", "-F", "-m", "1", "-f", file, rev]);
          } catch (e) {
            if ((e as { code?: number }).code === 1) break;
            throw e;
          }
          for (const word of out.split("\n")) if (word) found.add(word);
        }
        return found;
      } finally {
        await rm(dir, { recursive: true, force: true });
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
