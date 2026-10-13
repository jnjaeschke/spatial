import { realpathSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Commit } from "../../shared/types.ts";
import type { GitCapability } from "../tasks.ts";
import { parseBlame } from "../blame.ts";
import { hasExitCode, runGit, safeRepoPath, safeRevision } from "./run.ts";

/** Lines of `git status --porcelain` (staged, unstaged and untracked non-ignored changes). Runs with `--no-optional-locks`, so the index file is not refreshed. */
export async function statusLines(repo: string, signal?: AbortSignal): Promise<string[]> {
  return (await runGit(repo, ["--no-optional-locks", "status", "--porcelain", "--untracked-files=normal"], { signal })).split("\n").filter(Boolean);
}

/** `path` at `rev`, verbatim. */
export async function fileText(repo: string, rev: string, path: string, signal?: AbortSignal): Promise<string> {
  return runGit(repo, ["show", "--end-of-options", `${rev}:${path}`], { signal });
}

/** The lines of `path` at `rev`; rejects a `rev` or `path` that git could read as an option or that leaves the repository. */
export async function fileLines(repo: string, rev: string, path: string, signal?: AbortSignal): Promise<string[]> {
  safeRevision(rev, "revision");
  safeRepoPath(path);
  return (await fileText(repo, rev, path, signal)).replace(/\n$/, "").split(/\r?\n/);
}

/** The best common ancestor of `a` and `b`; null when they share none. Other failures (an unknown revision) reject. */
export async function mergeBase(repo: string, a: string, b: string, signal?: AbortSignal): Promise<string | null> {
  try { return (await runGit(repo, ["merge-base", "--end-of-options", a, b], { signal })).trim(); }
  catch (e) { if (hasExitCode(e, 1)) return null; throw e; }
}

/** The target of `refs/remotes/origin/HEAD` as a full ref name; null when the repository has none. */
export async function remoteDefaultRef(repo: string, signal?: AbortSignal): Promise<string | null> {
  try { return (await runGit(repo, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], { signal })).trim() || null; }
  catch { signal?.throwIfAborted(); return null; }
}

/** The local `main`, else `master`, as a full ref name and its commit; null without either. */
export async function localMainline(repo: string, signal?: AbortSignal): Promise<{ ref: string; sha: string } | null> {
  for (const ref of ["refs/heads/main", "refs/heads/master"]) {
    try { return { ref, sha: (await runGit(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { signal })).trim() }; }
    catch { signal?.throwIfAborted(); }
  }
  return null;
}

/** Read-only git access to `repo`; with a `signal`, aborting it kills the running git process and rejects the call in flight. */
export function makeGit(repo: string, signal?: AbortSignal): GitCapability {
  const git = (args: string[]) => runGit(repo, args, { signal });
  return {
    effect: "read-only",
    async isDirty() {
      return (await statusLines(repo, signal)).length > 0;
    },
    async resolve(rev) {
      safeRevision(rev, "revision");
      try {
        return (await git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`])).trim();
      } catch {
        signal?.throwIfAborted();
        throw new Error(`Cannot resolve revision "${rev}" in ${repo}`);
      }
    },
    async isAncestor(ancestor, descendant) {
      try {
        safeRevision(ancestor, "revision");
        safeRevision(descendant, "revision");
        await git(["merge-base", "--is-ancestor", "--end-of-options", ancestor, descendant]);
        return true;
      } catch (e) {
        if (hasExitCode(e, 1)) return false;
        throw e;
      }
    },
    async mergeBase(a, b) {
      safeRevision(a, "revision");
      safeRevision(b, "revision");
      try {
        await git(["rev-parse", "--verify", "--quiet", `${b}^{commit}`]);
      } catch {
        signal?.throwIfAborted();
        return null;
      }
      return mergeBase(repo, a, b, signal);
    },
    async mainlineRefs() {
      const out = await git(["for-each-ref", "--format=%(refname)", "refs/heads/main", "refs/heads/master", "refs/remotes/*/main", "refs/remotes/*/master"]);
      return out.split("\n").filter(Boolean);
    },
    async branches() {
      const out = await git(["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)%00%(objectname)%00%(committerdate:unix)%00%(HEAD)", "refs/heads"]);
      const all = out.split("\n").filter(Boolean).map((line) => {
        const [name, sha, date, head] = line.split("\0");
        return { name: name!, sha: sha!, date: Number(date), current: head === "*" };
      });
      return [...all.filter((b) => b.current), ...all.filter((b) => !b.current)];
    },
    async patchIds(baseSha, headSha) {
      safeRevision(baseSha, "base");
      safeRevision(headSha, "head");
      const patches = await git(["log", "--reverse", "-p", "--no-color", "--no-ext-diff", "--format=commit %H", "--end-of-options", `${baseSha}..${headSha}`]);
      if (!patches.trim()) return [];
      // patch-id prints "<patch id> <commit>" per commit, in input order; commits without a diff print nothing.
      const out = await runGit(repo, ["patch-id", "--stable"], { signal, input: patches });
      return out.split("\n").filter(Boolean).map((line) => { const [patchId, sha] = line.split(" "); return { sha: sha!, patchId: patchId! }; });
    },
    async log(baseSha, headSha) {
      safeRevision(baseSha, "base");
      safeRevision(headSha, "head");
      const out = await git(["log", "--reverse", "--format=%H%x00%s%x00%b%x1e", "--end-of-options", `${baseSha}..${headSha}`]);
      return out.split("\x1e").map((r) => r.replace(/^\n/, "")).filter((r) => r.length > 0).map((r): Commit => {
        const [sha, subject, body] = r.split("\x00");
        return { sha, subject, body: body.trim() };
      });
    },
    async diff(baseSha, headSha) {
      safeRevision(baseSha, "base");
      safeRevision(headSha, "head");
      return git(["diff", "--no-color", "--no-ext-diff", "--no-textconv", "-M", "-U3", "--end-of-options", baseSha, headSha]);
    },
    async blame(baseSha, rev, file, direction) {
      safeRevision(baseSha, "base");
      safeRevision(rev, "revision");
      const args = ["blame", "--no-textconv", "--porcelain"];
      if (direction === "reverse") args.push("--reverse");
      args.push(`${baseSha}..${rev}`, "--", file);
      return parseBlame(await git(args), file);
    },
    async replay(oldBase, newBase, oldHead) {
      safeRevision(oldBase, "old base");
      safeRevision(newBase, "new base");
      safeRevision(oldHead, "old head");
      let out: string;
      try {
        out = await git(["merge-tree", "--write-tree", "--name-only", "--no-messages", "-z", `--merge-base=${oldBase}`, "--end-of-options", newBase, oldHead]);
      } catch (e) {
        if (!hasExitCode(e, 1)) throw e;
        out = (e as { stdout: string }).stdout;
      }
      const [tree, ...paths] = out.split("\0");
      return { tree: tree!, conflicts: paths.filter((path) => path !== "") };
    },
    async show(sha, path) {
      try {
        return await fileText(repo, sha, path, signal);
      } catch {
        signal?.throwIfAborted();
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
            out = await git(["grep", "-o", "-h", "-w", "-I", "-F", "-m", "1", "-f", file, rev]);
          } catch (e) {
            if (hasExitCode(e, 1)) break;
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
    out = await runGit(path, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"]);
  } catch {
    throw new Error(`Not a git repository: ${path}`);
  }
  const [worktree, commonDir] = out.trim().split("\n");
  if (!worktree || !commonDir) throw new Error(`Not a git repository: ${path}`);
  return { worktree, repoDir: realpathSync(commonDir) };
}
