import { type GitCapability, makeGitWriter } from "../../../plugin-api.ts";

const IDENTITY = { name: "Spatial Review", email: "spatial-review@localhost" };

/** Most commits the default range may cover; more means the fork point is wrong (e.g. a stale local main), so the user names the range. */
export const MAX_DEFAULT_COMMITS = 50;

/** The range `/review` means without refs: uncommitted changes when present; otherwise commits since the nearest fork point from a local or remote-tracking main/master (a stale local main must not pull in upstream history), falling back to the latest commit on the default branch. Dirty worktrees are snapshotted under `refs/spatial/worktree/<sha12>`. */
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
  let nearest: string | null = null;
  for (const ref of await git.mainlineRefs()) {
    const base = await git.mergeBase("HEAD", ref);
    if (base && (nearest === null || await git.isAncestor(nearest, base))) nearest = base;
  }
  if (nearest === null || nearest === await git.resolve("HEAD")) return { base: "HEAD~1", head: "HEAD" };
  const count = (await git.log(nearest, "HEAD")).length;
  if (count > MAX_DEFAULT_COMMITS) throw new Error(`The branch is ${count} commits ahead of its nearest main/master (${nearest.slice(0, 12)}); name the range to review, e.g. /review HEAD~3..HEAD`);
  return { base: nearest, head: "HEAD" };
}
