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
  const log = await git.log(base, head);
  assert.deepEqual(log.map((c) => [c.sha, c.subject, c.body]), [[mid, "Bug 1 - part 1", "Body line."], [head, "Bug 1 - part 2", ""]]);
  const diff = await git.diff(base, head);
  assert.match(diff, /^diff --git a\/a.txt b\/a.txt/m);
  assert.match(diff, /^\+TWO$/m);
  assert.doesNotMatch(diff, /\x1b\[/);
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
