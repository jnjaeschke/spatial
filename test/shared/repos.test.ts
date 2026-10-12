import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByRepo, recentFirst, repoName } from "../../src/shared/repos.ts";
import type { SessionListing } from "../../src/shared/types.ts";

const session = (id: string, repoDir: string, lastActive: string): SessionListing => ({
  id, worktree: `/${id}`, repoDir, title: id, createdAt: "0", lastActive, workflow: "review",
});

test("repoName handles worktree common dirs and .git suffixes", () => {
  assert.equal(repoName("/home/u/gecko/.git"), "gecko");
  assert.equal(repoName("/srv/proj.git"), "proj");
  assert.equal(repoName("/srv/proj"), "proj");
});

test("groups sessions by repo, most recently active first", () => {
  assert.deepEqual(groupByRepo([
    session("a1", "/repos/a/.git", "1"),
    session("b1", "/repos/b/.git", "2"),
    session("a2", "/repos/a/.git", "3"),
    session("b2", "/repos/b/.git", "4"),
  ]), [
    { repoDir: "/repos/b/.git", name: "b", sessions: [session("b2", "/repos/b/.git", "4"), session("b1", "/repos/b/.git", "2")] },
    { repoDir: "/repos/a/.git", name: "a", sessions: [session("a2", "/repos/a/.git", "3"), session("a1", "/repos/a/.git", "1")] },
  ]);
});

test("recentFirst preserves input order for ties", () => {
  const tied = [session("first", "/repo/.git", "same"), session("second", "/repo/.git", "same")];
  assert.deepEqual(recentFirst(tied), tied);
});
