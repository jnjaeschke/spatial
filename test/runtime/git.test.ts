import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGit, createSession } from "../../src/runtime/git.ts";
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

test("createSession stores repo toplevel and rejects non-repos", async () => {
  const r = makeRepo();
  r.commit({ "sub/x.txt": "x" }, "c");
  const store = new Store(":memory:");
  const s = await createSession(store, join(r.dir, "sub"), "t");
  assert.equal(s.repo, realpathSync(r.dir));
  const notRepo = mkdtempSync(join(tmpdir(), "norepo-"));
  await assert.rejects(createSession(store, notRepo, "t"), /Not a git repository/);
});
