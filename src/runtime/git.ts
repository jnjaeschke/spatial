import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Commit, Session } from "../shared/types.ts";
import type { Store } from "./store.ts";
import type { GitCapability } from "./tasks.ts";

const run = promisify(execFile);
const MAX_BUFFER = 512 * 1024 * 1024;

async function git(repo: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-C", repo, "-c", "core.quotePath=false", ...args], { maxBuffer: MAX_BUFFER, encoding: "utf8" });
  return stdout;
}

export function makeGit(repo: string): GitCapability {
  return {
    effect: "read-only",
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

/** Creates a session after validating that `repo` is inside a git work tree. */
export async function createSession(store: Store, repo: string, title: string): Promise<Session> {
  let toplevel: string;
  try {
    toplevel = (await git(repo, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    throw new Error(`Not a git repository: ${repo}`);
  }
  return store.createSession(toplevel, title);
}
