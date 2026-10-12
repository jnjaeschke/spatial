import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedFiles, commitDetail, diffFiles, fileAt, hasCommitGraph, logPage, refs } from "../../src/runtime/scm.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

function history() {
  const r = makeRepo();
  const root = r.commit({ "a.txt": "one\n", "old name.txt": "keep\nthis\nfile\n" }, "root");
  r.git("switch", "-q", "-c", "feature/x");
  const side = r.commit({ "b.bin": "\0\x01binary", "a.txt": "one\nside\n" }, "side\n\nBody line.");
  r.git("switch", "-q", "main");
  const main2 = r.commit({ "c.txt": "c\n" }, "main two");
  r.git("-c", "core.editor=true", "merge", "-q", "--no-ff", "-m", "merge feature", "feature/x");
  const merge = r.git("rev-parse", "HEAD");
  r.git("mv", "old name.txt", "new name.txt");
  r.git("commit", "-q", "-m", "rename");
  const rename = r.git("rev-parse", "HEAD");
  r.git("tag", "-a", "v1", "-m", "annotated", main2);
  return { r, root, side, main2, merge, rename };
}

// REQUIRES_REAL_GIT
test("logPage pages a topo-ordered log with parents", async () => {
  const { r, root, side, main2, merge, rename } = history();
  const all = await logPage(r.dir, { kind: "all" }, 0, 10);
  assert.deepEqual(all.map((row) => row.sha).sort(), [rename, merge, side, main2, root].sort());
  assert.equal(all[0]!.sha, rename);
  assert.equal(all[1]!.sha, merge);
  assert.equal(all.at(-1)!.sha, root);
  assert.deepEqual(all.find((row) => row.sha === merge)!.parents, [main2, side]);
  assert.deepEqual(all.find((row) => row.sha === root)!.parents, []);
  assert.equal(all[0]!.subject, "rename");
  assert.equal(all[0]!.author, "T");
  assert.equal(all[0]!.email, "t@t");
  assert.match(all[0]!.date, /^\d{4}-\d{2}-\d{2}T/);
  const second = await logPage(r.dir, { kind: "all" }, 2, 2);
  assert.deepEqual(second.map((row) => row.sha), all.slice(2, 4).map((row) => row.sha));
  assert.deepEqual((await logPage(r.dir, { kind: "range", range: `${main2}..${merge}` }, 0, 10)).map((row) => row.sha).sort(), [merge, side].sort());
  await assert.rejects(logPage(r.dir, { kind: "range", range: "--all" }, 0, 10), /Invalid range/);
  await assert.rejects(logPage(r.dir, { kind: "all" }, -1, 10), /Invalid skip/);
});

// REQUIRES_REAL_GIT
test("logPage branches scope adds the remote default branch", async () => {
  const { r } = history();
  const remoteOnly = r.commit({ "d.txt": "d\n" }, "only on origin/main");
  r.git("reset", "-q", "--hard", "HEAD~1");
  const otherOnly = r.commit({ "e.txt": "e\n" }, "only on origin/other");
  r.git("reset", "-q", "--hard", "HEAD~1");
  r.git("update-ref", "refs/remotes/origin/main", remoteOnly);
  r.git("update-ref", "refs/remotes/origin/other", otherOnly);
  r.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  const rows = (await logPage(r.dir, { kind: "branches" }, 0, 50)).map((row) => row.sha);
  assert.ok(rows.includes(remoteOnly), "the remote default branch is walked");
  assert.ok(!rows.includes(otherOnly), "other remote branches are not");
});

// REQUIRES_REAL_GIT
test("refs lists heads, remotes, peeled tags, HEAD and worktree checkouts", async () => {
  const { r, side, main2, rename } = history();
  r.git("update-ref", "refs/remotes/origin/main", main2);
  r.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  r.git("remote", "add", "origin", "../origin.git");
  r.git("branch", "-q", "--set-upstream-to=origin/main", "main");
  const other = join(realpathSync(mkdtempSync(join(tmpdir(), "wt-"))), "linked");
  r.git("worktree", "add", "-q", other, "feature/x");
  const date = (sha: string) => r.git("show", "--no-patch", "--format=%cI", sha);
  const rows = await refs(r.dir);
  const byName = new Map(rows.map((row) => [`${row.kind}:${row.name}`, row]));
  assert.deepEqual(byName.get("head:main"), { name: "main", kind: "head", sha: rename, date: date(rename), upstream: "origin/main", worktree: realpathSync(r.dir) });
  assert.deepEqual(byName.get("head:feature/x"), { name: "feature/x", kind: "head", sha: side, date: date(side), worktree: other });
  assert.deepEqual(byName.get("remote:origin/main"), { name: "origin/main", kind: "remote", sha: main2, date: date(main2) });
  assert.equal(byName.has("remote:origin/HEAD"), false);
  assert.deepEqual(byName.get("tag:v1"), { name: "v1", kind: "tag", sha: main2, date: date(main2) });
  assert.deepEqual(byName.get("HEAD:HEAD"), { name: "HEAD", kind: "HEAD", sha: rename, date: date(rename) });
  assert.deepEqual((await refs(other)).find((row) => row.kind === "HEAD"), { name: "HEAD", kind: "HEAD", sha: side, date: date(side) });
});

// REQUIRES_REAL_GIT
test("hasCommitGraph looks in the common git dir", async () => {
  const { r } = history();
  assert.equal(await hasCommitGraph(r.dir), false);
  r.git("commit-graph", "write", "--reachable");
  assert.equal(await hasCommitGraph(r.dir), true);
  const other = join(realpathSync(mkdtempSync(join(tmpdir(), "wt-"))), "linked");
  r.git("worktree", "add", "-q", "--detach", other);
  assert.equal(await hasCommitGraph(other), true);
});

// REQUIRES_REAL_GIT
test("commitDetail has the message, both identities and per-file stats against the first parent", async () => {
  const { r, root, side, merge, rename } = history();
  const detail = await commitDetail(r.dir, side);
  assert.equal(detail.sha, side);
  assert.equal(detail.subject, "side");
  assert.equal(detail.body, "Body line.");
  assert.equal(detail.committer, "T");
  assert.match(detail.committerDate, /^\d{4}-/);
  assert.deepEqual(detail.files, [
    { path: "a.txt", status: "modified", added: 1, deleted: 0, binary: false },
    { path: "b.bin", status: "added", added: 0, deleted: 0, binary: true },
  ]);
  assert.deepEqual((await commitDetail(r.dir, root)).files.map((file) => [file.path, file.status, file.added]), [["a.txt", "added", 1], ["old name.txt", "added", 3]]);
  assert.deepEqual((await commitDetail(r.dir, merge)).files.map((file) => file.path).sort(), ["a.txt", "b.bin"]);
  assert.deepEqual((await commitDetail(r.dir, rename)).files, [{ path: "new name.txt", oldPath: "old name.txt", status: "renamed", added: 0, deleted: 0, binary: false }]);
  await assert.rejects(commitDetail(r.dir, "--all"), /Invalid revision/);
  await assert.rejects(commitDetail(r.dir, "no-such-rev"));
});

// REQUIRES_REAL_GIT
test("diffFiles parses a range, a root commit against the empty tree, and selected paths", async () => {
  const { r, root, side, rename } = history();
  const files = await diffFiles(r.dir, root, side);
  assert.deepEqual(files.map((file) => [file.path, file.status, file.binary]), [["a.txt", "modified", false], ["b.bin", "added", true]]);
  assert.deepEqual(files[0]!.hunks[0]!.lines.filter((line) => line.kind !== "ctx"), [{ kind: "add", text: "side" }]);
  assert.deepEqual((await diffFiles(r.dir, null, root)).map((file) => [file.path, file.status]), [["a.txt", "added"], ["old name.txt", "added"]]);
  assert.deepEqual((await diffFiles(r.dir, root, side, ["a.txt"])).map((file) => file.path), ["a.txt"]);
  assert.deepEqual((await diffFiles(r.dir, `${rename}~1`, rename)).map((file) => [file.path, file.oldPath, file.status]), [["new name.txt", "old name.txt", "renamed"]]);
  assert.deepEqual((await diffFiles(r.dir, `${rename}~1`, rename, ["old name.txt", "new name.txt"])).map((file) => [file.path, file.oldPath, file.status]), [["new name.txt", "old name.txt", "renamed"]]);
  await assert.rejects(diffFiles(r.dir, root, side, ["../x"]), /Invalid path/);
});

// REQUIRES_REAL_GIT
test("changedFiles lists a range's files, and from the empty tree for null", async () => {
  const { r, root, side, rename } = history();
  assert.deepEqual((await changedFiles(r.dir, root, side)).map((file) => [file.path, file.status]), [["a.txt", "modified"], ["b.bin", "added"]]);
  assert.deepEqual((await changedFiles(r.dir, null, root)).map((file) => [file.path, file.status]), [["a.txt", "added"], ["old name.txt", "added"]]);
  assert.deepEqual((await changedFiles(r.dir, root, rename)).map((file) => file.path), ["a.txt", "b.bin", "c.txt", "new name.txt"]);
  await assert.rejects(changedFiles(r.dir, "--all", rename), /Invalid revision/);
});

// REQUIRES_REAL_GIT
test("logPage current scope walks from the merge-base with the default branch to HEAD", async () => {
  const { r, rename } = history();
  r.git("update-ref", "refs/remotes/origin/main", rename);
  r.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  r.git("switch", "-q", "-c", "work");
  const one = r.commit({ "w.txt": "1\n" }, "work one");
  const two = r.commit({ "w.txt": "2\n" }, "work two");
  assert.deepEqual((await logPage(r.dir, { kind: "current" }, 0, 50)).map((row) => row.sha), [two, one]);
  r.git("switch", "-q", "main");
  const onMain = (await logPage(r.dir, { kind: "current" }, 0, 50)).map((row) => row.sha);
  assert.ok(onMain.includes(two) && onMain.includes(rename), "on the default branch it walks all branches");
});

// REQUIRES_REAL_GIT
test("logPage current scope falls back to local main without a remote", async () => {
  const { r, rename } = history();
  r.git("switch", "-q", "-c", "work");
  const one = r.commit({ "w.txt": "1\n" }, "work one");
  assert.deepEqual((await logPage(r.dir, { kind: "current" }, 0, 50)).map((row) => row.sha), [one]);
  assert.ok(rename);
});

// REQUIRES_REAL_GIT
test("fileAt returns the lines of a file at a revision", async () => {
  const { r, root } = history();
  assert.deepEqual(await fileAt(r.dir, root, "old name.txt"), ["keep", "this", "file"]);
  await assert.rejects(fileAt(r.dir, root, "missing.txt"));
  await assert.rejects(fileAt(r.dir, root, "/etc/passwd"), /Invalid path/);
});
