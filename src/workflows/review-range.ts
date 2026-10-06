import type { Id } from "../shared/types.ts";
import type { Runtime } from "../runtime/tasks.ts";
import { makeGitWriter } from "../runtime/git.ts";

const IDENTITY = { name: "Spatial Review", email: "spatial-review@localhost" };

/** The range `/review` means without refs: the uncommitted changes of the session's worktree when there are any, else the latest commit. Dirty: snapshots the worktree (objects plus `refs/spatial/worktree/<sha12>` only) and returns `{ base: <HEAD at snapshot time>, head: <that ref> }`. Clean (also when the snapshot tree equals HEAD's): `{ base: "HEAD~1", head: "HEAD" }`. */
export async function defaultReviewRange(rt: Runtime, sessionId: Id): Promise<{ base: string; head: string }> {
  const git = rt.gitFor(sessionId);
  if (await git.isDirty()) {
    const writer = makeGitWriter(rt.store.getSession(sessionId).worktree);
    const snapshot = await writer.snapshotWorktree({ ...IDENTITY, time: Math.floor(Date.now() / 1000) });
    if (snapshot) {
      const head = `refs/spatial/worktree/${snapshot.slice(0, 12)}`;
      await writer.updateRef(head, snapshot);
      return { base: await git.resolve(`${snapshot}^`), head };
    }
  }
  return { base: "HEAD~1", head: "HEAD" };
}
