import type { GitCapability } from "../runtime/tasks.ts";
import { makeGitWriter } from "../runtime/git.ts";

const IDENTITY = { name: "Spatial Review", email: "spatial-review@localhost" };

/** The range `/review` means without refs: uncommitted changes when present; otherwise commits since the local main/master fork point, falling back to the latest commit on the default branch. Dirty worktrees are snapshotted under `refs/spatial/worktree/<sha12>`. */
export async function defaultReviewRange(repo: string, git: GitCapability): Promise<{ base: string; head: string }> {
  if (await git.isDirty()) {
    const writer = makeGitWriter(repo);
    const snapshot = await writer.snapshotWorktree({ ...IDENTITY, time: Math.floor(Date.now() / 1000) });
    if (snapshot) {
      const head = `refs/spatial/worktree/${snapshot.slice(0, 12)}`;
      await writer.updateRef(head, snapshot);
      return { base: await git.resolve(`${snapshot}^`), head };
    }
  }
  for (const branch of ["main", "master"]) {
    const base = await git.mergeBase("HEAD", branch);
    if (base) {
      return base === await git.resolve("HEAD")
        ? { base: "HEAD~1", head: "HEAD" }
        : { base, head: "HEAD" };
    }
  }
  return { base: "HEAD~1", head: "HEAD" };
}
