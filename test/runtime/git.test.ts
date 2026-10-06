import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGit, makeGitWriter, createSession, resolveRepo } from "../../src/runtime/git.ts";
import { parseUnifiedDiff } from "../../src/runtime/diff-parse.ts";
import { attribute } from "../../src/runtime/attribution.ts";
import { findRewrites } from "../../src/runtime/rewrites.ts";
import { Store } from "../../src/runtime/store.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

async function rawDiffOf(before: Record<string, string>, after: Record<string, string>) {
  const r = makeRepo();
  const a = r.commit(before, "before");
  const b = r.commit(after, "after");
  return makeGit(r.dir).diff(a, b);
}

const identity = { name: "Spatial Review", email: "spatial-review@localhost", time: 1_700_000_000 };
const snapshot = (r: ReturnType<typeof makeRepo>) => ({
  head: r.git("rev-parse", "HEAD"),
  branch: r.git("symbolic-ref", "HEAD"),
  status: r.git("status", "--porcelain"),
  refs: r.git("for-each-ref"),
  index: readFileSync(join(r.dir, ".git", "index")),
});

const worktreeState = (r: ReturnType<typeof makeRepo>) => ({
  ...snapshot(r), files: readdirSync(r.dir).sort(), a: readFileSync(join(r.dir, "a.txt"), "utf8"),
});

function dirtyRepo() {
  const r = makeRepo();
  r.commit({ "a.txt": "1\n2\n3\n", "d.txt": "d\n", "keep.txt": "k\n", ".gitignore": "ignored.log\n" }, "base");
  writeFileSync(join(r.dir, "a.txt"), "1\nTWO\n3\n");
  rmSync(join(r.dir, "d.txt"));
  writeFileSync(join(r.dir, "s.txt"), "staged\n");
  r.git("add", "s.txt");
  writeFileSync(join(r.dir, "u.txt"), "untracked\n");
  writeFileSync(join(r.dir, "ignored.log"), "noise\n");
  return r;
}

// REQUIRES_REAL_GIT
test("snapshotWorktree commits the exact worktree without changing checkout state", async () => {
  const r = dirtyRepo();
  const before = worktreeState(r);
  const sha = await makeGitWriter(r.dir).snapshotWorktree(identity);
  assert.ok(sha);
  r.git("cat-file", "-e", sha);
  assert.equal(r.git("rev-parse", `${sha}^`), before.head);
  assert.equal(r.git("log", "-1", "--format=%an,%ae,%cn,%ce,%at,%ct,%s", sha), "Spatial Review,spatial-review@localhost,Spatial Review,spatial-review@localhost,1700000000,1700000000,Uncommitted changes");
  assert.equal(r.git("ls-tree", "-r", "--name-only", sha), ".gitignore\na.txt\nkeep.txt\ns.txt\nu.txt");
  assert.equal(await makeGit(r.dir).show(sha, "a.txt"), "1\nTWO\n3\n");
  assert.deepEqual(worktreeState(r), before);
});

// REQUIRES_REAL_GIT
test("snapshotWorktree returns null for an unchanged tree, including a reverted staged edit", async () => {
  const r = makeRepo();
  r.commit({ "a.txt": "old\n" }, "base");
  const writer = makeGitWriter(r.dir);
  assert.equal(await writer.snapshotWorktree(identity), null);
  writeFileSync(join(r.dir, "a.txt"), "new\n");
  r.git("add", "a.txt");
  writeFileSync(join(r.dir, "a.txt"), "old\n");
  assert.equal(await makeGit(r.dir).isDirty(), true);
  assert.equal(await writer.snapshotWorktree(identity), null);
});

// REQUIRES_REAL_GIT
test("snapshotWorktree rejects when HEAD does not exist", async () => {
  const r = makeRepo();
  await assert.rejects(makeGitWriter(r.dir).snapshotWorktree(identity));
});

// REQUIRES_REAL_GIT
test("snapshotWorktree reads the correct index in a linked worktree", async () => {
  const r = makeRepo();
  r.commit({ "a.txt": "base\n" }, "base");
  const wt = mkdtempSync(join(tmpdir(), "linked-worktree-"));
  try {
    r.git("worktree", "add", "-q", wt, "-b", "side");
    writeFileSync(join(wt, "new.txt"), "new\n");
    const sha = await makeGitWriter(wt).snapshotWorktree(identity);
    assert.ok(sha);
    assert.equal(r.git("ls-tree", "-r", "--name-only", sha), "a.txt\nnew.txt");
    assert.equal(r.git("--no-optional-locks", "status", "--porcelain"), "");
  } finally {
    rmSync(wt, { recursive: true, force: true });
  }
});

// REQUIRES_REAL_GIT
test("isDirty reports visible changes and does not refresh the index", async () => {
  const r = makeRepo();
  r.commit({ "a.txt": "base\n", ".gitignore": "ignored.log\n" }, "base");
  const git = makeGit(r.dir);
  assert.equal(await git.isDirty(), false);
  writeFileSync(join(r.dir, "a.txt"), "edit\n");
  assert.equal(await git.isDirty(), true);
  writeFileSync(join(r.dir, "a.txt"), "base\n");
  writeFileSync(join(r.dir, "untracked"), "u\n");
  assert.equal(await git.isDirty(), true);
  rmSync(join(r.dir, "untracked"));
  writeFileSync(join(r.dir, "staged"), "s\n");
  r.git("add", "staged");
  assert.equal(await git.isDirty(), true);
  r.git("reset", "-q", "--", "staged");
  rmSync(join(r.dir, "staged"));
  writeFileSync(join(r.dir, "ignored.log"), "noise\n");
  assert.equal(await git.isDirty(), false);
  utimesSync(join(r.dir, "a.txt"), 1_000_000_000, 1_000_000_000);
  const index = readFileSync(join(r.dir, ".git", "index"));
  assert.equal(await git.isDirty(), false);
  assert.deepEqual(readFileSync(join(r.dir, ".git", "index")), index);
});

// REQUIRES_REAL_GIT
test("commitPatch writes a deterministic commit without changing checkout state", async () => {
  const r = makeRepo();
  const base = r.commit({ "a.txt": "old\n" }, "base");
  const rawDiff = await rawDiffOf({ "a.txt": "old\n" }, { "a.txt": "new\n", "b.txt": "added\n" });
  const before = snapshot(r);
  const writer = makeGitWriter(r.dir);
  const message = "Title\n\nDifferential Revision: https://phab.example.com/D1";
  const sha = await writer.commitPatch(base, rawDiff, message, identity);
  assert.equal(r.git("rev-parse", `${sha}^`), base);
  assert.equal(await makeGit(r.dir).show(sha, "a.txt"), "new\n");
  assert.equal(await makeGit(r.dir).show(sha, "b.txt"), "added\n");
  assert.equal(r.git("log", "-1", "--format=%an,%ae,%cn,%ce,%at,%ct%n%B", sha), `Spatial Review,spatial-review@localhost,Spatial Review,spatial-review@localhost,1700000000,1700000000\n${message}`);
  assert.deepEqual(snapshot(r), before);
  r.git("cat-file", "-e", sha);
  assert.equal(await writer.commitPatch(base, rawDiff, message, identity), sha);
});

// REQUIRES_REAL_GIT
test("commitPatch ignores dirty work tree state", async () => {
  const r = makeRepo();
  const base = r.commit({ "a.txt": "old\n" }, "base");
  const rawDiff = await rawDiffOf({ "a.txt": "old\n" }, { "a.txt": "new\n" });
  writeFileSync(join(r.dir, "a.txt"), "dirty\n");
  writeFileSync(join(r.dir, "untracked.txt"), "untracked\n");
  const status = r.git("status", "--porcelain");
  const sha = await makeGitWriter(r.dir).commitPatch(base, rawDiff, "patch", identity);
  assert.equal(await makeGit(r.dir).show(sha, "a.txt"), "new\n");
  assert.equal(r.git("status", "--porcelain"), status);
  assert.notEqual(status, "");
});

// REQUIRES_REAL_GIT
test("commitPatch rejects an inapplicable patch without changing checkout state", async () => {
  const r = makeRepo();
  const base = r.commit({ "a.txt": "different\n" }, "base");
  const rawDiff = await rawDiffOf({ "a.txt": "old\n" }, { "a.txt": "new\n" });
  const before = snapshot(r);
  await assert.rejects(makeGitWriter(r.dir).commitPatch(base, rawDiff, "patch", identity), new RegExp(`Patch does not apply on ${base}`));
  assert.deepEqual(snapshot(r), before);
});

// REQUIRES_REAL_GIT
test("updateRef writes only refs under refs/spatial", async () => {
  const r = makeRepo();
  const sha = r.commit({ "a.txt": "x\n" }, "base");
  const before = r.git("for-each-ref", "--format=%(objectname) %(objecttype) %(refname)");
  const writer = makeGitWriter(r.dir);
  await writer.updateRef("refs/spatial/D1/5-abc", sha);
  assert.equal(r.git("rev-parse", "refs/spatial/D1/5-abc"), sha);
  assert.equal(r.git("for-each-ref", "--format=%(objectname) %(objecttype) %(refname)"), `${before}\n${sha} commit refs/spatial/D1/5-abc`);
  await assert.rejects(writer.updateRef("refs/heads/main", sha), /refs\/spatial\//);
  await assert.rejects(writer.updateRef("refs/spatial/..\/heads\/x", sha), /refs\/spatial\//);
  assert.equal(r.git("rev-parse", "refs/heads/main"), sha);
});

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
  const s = await createSession(store, join(r.dir, "sub"), "t", "review");
  assert.equal(s.workflow, "review");
  assert.equal(s.worktree, realpathSync(r.dir));
  assert.equal(s.repoDir, realpathSync(join(r.dir, ".git")));
  const notRepo = mkdtempSync(join(tmpdir(), "norepo-"));
  await assert.rejects(createSession(store, notRepo, "t", "review"), /Not a git repository/);
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
