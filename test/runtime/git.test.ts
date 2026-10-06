import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGit, createSession, resolveRepo } from "../../src/runtime/git.ts";
import { parseUnifiedDiff } from "../../src/runtime/diff-parse.ts";
import { attribute } from "../../src/runtime/attribution.ts";
import { findRewrites } from "../../src/runtime/rewrites.ts";
import { Store } from "../../src/runtime/store.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

test("resolve, isAncestor, log, diff", async () => {
  const r = makeRepo();
  const base = r.commit({ "a.txt": "1\n2\n3\n" }, "base");
  const mid = r.commit({ "a.txt": "1\nTWO\n3\n" }, "Bug 1 - part 1\n\nBody line.");
  const head = r.commit({ "b.txt": "new\n" }, "Bug 1 - part 2");
  const git = makeGit(r.dir);
  assert.equal(await git.resolve("HEAD~2"), base);
  assert.equal(await git.resolve(head.slice(0, 8)), head);
  await assert.rejects(git.resolve("nope"), /Cannot resolve revision "nope"/);
  assert.equal(await git.isAncestor(base, head), true);
  assert.equal(await git.isAncestor(head, base), false);
  assert.equal(await git.show(head, "a.txt"), "1\nTWO\n3\n");
  await assert.rejects(git.show(head, "missing.txt"), /Cannot read missing\.txt at/);
  const log = await git.log(base, head);
  assert.deepEqual(log.map((c) => [c.sha, c.subject, c.body]), [[mid, "Bug 1 - part 1", "Body line."], [head, "Bug 1 - part 2", ""]]);
  const diff = await git.diff(base, head);
  assert.match(diff, /^diff --git a\/a.txt b\/a.txt/m);
  assert.match(diff, /^\+TWO$/m);
  assert.doesNotMatch(diff, /\x1b\[/);
});

// REQUIRES_REAL_GIT
test("blame returns forward and reverse line ownership", async () => {
  const r = makeRepo();
  const base = r.commit({ "a.txt": "one\ntwo\nthree\n" }, "base");
  const first = r.commit({ "a.txt": "one\nTWO\nthree\n" }, "first");
  const head = r.commit({ "a.txt": "one\nTWO\n" }, "second");
  const git = makeGit(r.dir);
  const forward = await git.blame(base, head, "a.txt", "forward");
  assert.equal(forward.find((entry) => entry.line === 2)?.sha, first);
  assert.equal(forward.find((entry) => entry.line === 2)?.origLine, 2);
  const reverse = await git.blame(base, head, "a.txt", "reverse");
  assert.equal(reverse.find((entry) => entry.line === 2)?.sha, base);
  assert.equal(reverse.find((entry) => entry.line === 3)?.sha, first);
});

// REQUIRES_REAL_GIT
test("per-commit rewrite detection flags replaced additions, not base-line changes", async () => {
  const r = makeRepo();
  r.commit({ "a.txt": "base\nkeep\n" }, "base");
  r.commit({ "a.txt": "base\nL\nkeep\n" }, "first");
  const head = r.commit({ "a.txt": "base\nchanged\nkeep\n" }, "second");
  const git = makeGit(r.dir);
  const commits = await git.log(await git.resolve("HEAD~2"), head);
  const allFiles = parseUnifiedDiff(await git.diff(await git.resolve("HEAD~2"), head));
  const base = await git.resolve("HEAD~2");
  await attribute(git, base, head, commits, allFiles);
  await findRewrites(git, base, commits, allFiles);
  assert.deepEqual(allFiles[0]!.hunks[0]!.rewrites, [{ by: 1, of: 0, lines: 1 }]);

  const onlyBaseChange = makeRepo();
  onlyBaseChange.commit({ "a.txt": "base\nkeep\n" }, "base");
  onlyBaseChange.commit({ "a.txt": "base\nkeep\n", "b.txt": "first\n" }, "first");
  const changed = onlyBaseChange.commit({ "a.txt": "BASE\nkeep\n" }, "second");
  const onlyGit = makeGit(onlyBaseChange.dir);
  const onlyBase = await onlyGit.resolve("HEAD~2");
  const onlyCommits = await onlyGit.log(onlyBase, changed);
  const onlyFiles = parseUnifiedDiff(await onlyGit.diff(onlyBase, changed));
  await findRewrites(onlyGit, onlyBase, onlyCommits, onlyFiles);
  assert.equal(onlyFiles[0]!.hunks[0]!.rewrites, undefined);
});

// REQUIRES_REAL_GIT
test("replay rebases a patch and reports conflicted paths", async () => {
  const clean = makeRepo();
  clean.commit({ "a.txt": Array.from({ length: 30 }, (_, i) => `line${i}`).join("\n") + "\n", "b.txt": "base\n" }, "base");
  clean.git("checkout", "-q", "-b", "feat");
  const feat = clean.commit({ "a.txt": Array.from({ length: 30 }, (_, i) => i === 9 ? "author" : `line${i}`).join("\n") + "\n" }, "feature");
  clean.git("checkout", "-q", "main");
  const newBase = clean.commit({ "c.txt": "added\n" }, "upstream");
  const cleanReplay = await makeGit(clean.dir).replay(clean.git("rev-parse", "HEAD~1"), newBase, feat);
  assert.deepEqual(cleanReplay.conflicts, []);
  assert.equal(await makeGit(clean.dir).show(cleanReplay.tree, "c.txt"), "added\n");

  const conflict = makeRepo();
  conflict.commit({ "a.txt": Array.from({ length: 30 }, (_, i) => `line${i}`).join("\n") + "\n", "b.txt": "base\n" }, "base");
  const oldBase = conflict.git("rev-parse", "HEAD");
  conflict.git("checkout", "-q", "-b", "feat");
  const conflictHead = conflict.commit({ "a.txt": Array.from({ length: 30 }, (_, i) => i === 9 ? "author" : `line${i}`).join("\n") + "\n" }, "feature");
  conflict.git("checkout", "-q", "main");
  const movedBase = conflict.commit({ "a.txt": Array.from({ length: 30 }, (_, i) => i === 9 ? "upstream" : `line${i}`).join("\n") + "\n" }, "upstream conflict");
  assert.deepEqual((await makeGit(conflict.dir).replay(oldBase, movedBase, conflictHead)).conflicts, ["a.txt"]);
});

// REQUIRES_REAL_GIT
test("createSession stores worktree and repo identity and rejects non-repos", async () => {
  const r = makeRepo();
  r.commit({ "sub/x.txt": "x" }, "c");
  const store = new Store(":memory:");
  const s = await createSession(store, join(r.dir, "sub"), "t");
  assert.equal(s.worktree, realpathSync(r.dir));
  assert.equal(s.repoDir, realpathSync(join(r.dir, ".git")));
  const notRepo = mkdtempSync(join(tmpdir(), "norepo-"));
  await assert.rejects(createSession(store, notRepo, "t"), /Not a git repository/);
});

// REQUIRES_REAL_GIT
test("resolveRepo identifies linked worktrees and rejects bare repositories", async () => {
  const r = makeRepo();
  r.commit({ "a.txt": "x" }, "initial");
  const wt = join(mkdtempSync(join(tmpdir(), "worktree-")), "checkout");
  r.git("worktree", "add", "-q", wt, "-b", "wt");
  const main = await resolveRepo(r.dir);
  assert.deepEqual(await resolveRepo(wt), { worktree: realpathSync(wt), repoDir: main.repoDir });

  const bare = join(mkdtempSync(join(tmpdir(), "bare-")), "repo.git");
  r.git("clone", "--bare", r.dir, bare);
  await assert.rejects(resolveRepo(bare), /Not a git repository/);
});
