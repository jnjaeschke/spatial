import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../../src/runtime/store.ts";
import { Runtime } from "../../src/runtime/tasks.ts";
import { makeGit } from "../../src/runtime/git.ts";
import { commitRevision } from "../../src/shared/phabricator.ts";
import { checkDrift } from "../../src/runtime/drift.ts";
import { importRevision, ImportRevisionError } from "../../src/runtime/import-revision.ts";
import { READ_ONLY_METHODS, type Conduit } from "../../src/runtime/phab-revision.ts";
import { makeRepo } from "../helpers/git-fixture.ts";
import { importDiff } from "../../src/tasks/import-diff/task.ts";
import { hunkCommit } from "../../src/shared/review-path.ts";
import type { DiffData } from "../../src/shared/types.ts";

const host = "https://phab.example.com";
const identity = { name: "T", email: "t@t" };
const snapshot = (repo: ReturnType<typeof makeRepo>) => ({
  head: repo.git("rev-parse", "HEAD"), branch: repo.git("symbolic-ref", "HEAD"),
  status: repo.git("status", "--porcelain"), refs: repo.git("for-each-ref", "--exclude=refs/spatial", "--format=%(refname) %(objectname)"),
  index: readFileSync(join(repo.dir, ".git", "index")),
});

function setup(closedD1 = false) {
  const a = makeRepo();
  // When D1 has landed, the target repository's base must already contain
  // D1's change because D2's raw diff is relative to that tree.
  const baseSha = a.commit({ "a.txt": closedD1 ? "1\nTWO\n3\n" : "1\n2\n3\n" }, "base");
  const b = makeRepo();
  const scratchBase = b.commit({ "a.txt": "1\n2\n3\n" }, "base");
  const c1 = b.commit({ "a.txt": "1\nTWO\n3\n" }, "T1");
  const c2 = b.commit({ "a.txt": "1\nTWO\nTHREE\n", "b.txt": "added\n" }, "T2");
  const raw1 = makeGit(b.dir).diff(scratchBase, c1);
  const raw2 = makeGit(b.dir).diff(c1, c2);
  const calls: string[] = [];
  let invalidSecondPatch = false;
  let missingBase = false;
  let fail = false;
  let branching = false;
  const conduit = { async call(method: string, params: Record<string, unknown>) {
    calls.push(method);
    if (fail) throw new Error("fake conduit failure");
    if (method === "differential.revision.search") {
      const constraints = params.constraints as { ids?: number[] };
      if (constraints.ids) return { data: [{ id: 2, phid: "PHID-DREV-2", fields: { title: "T2", status: { closed: false }, stackGraph: {
        "PHID-DREV-2": branching ? ["PHID-DREV-1", "PHID-DREV-3"] : ["PHID-DREV-1"], "PHID-DREV-1": [], "PHID-DREV-3": [],
      } } }] };
      return { data: [
        { id: 1, phid: "PHID-DREV-1", fields: { title: "T1", status: { closed: closedD1 }, stackGraph: {} } },
        { id: 3, phid: "PHID-DREV-3", fields: { title: "T3", status: { closed: false }, stackGraph: {} } },
      ] };
    }
    if (method === "differential.diff.search") {
      const phid = (params.constraints as { revisionPHIDs: string[] }).revisionPHIDs[0];
      const id = phid === "PHID-DREV-1" ? 11 : 22;
      return { data: [{ id, fields: { dateCreated: id === 11 ? 1_700_000_000 : 1_700_000_100, refs: [{ type: "base", identifier: missingBase && id === 11 ? "d".repeat(40) : baseSha }] } }] };
    }
    if (method === "differential.getrawdiff") {
      const id = (params as { diffID: number }).diffID;
      return id === 11 ? raw1 : invalidSecondPatch ? "not a patch" : raw2;
    }
    throw new Error(`Unexpected Conduit method ${method}`);
  } };
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: a.dir, repoDir: join(a.dir, ".git"), title: "t" });
  const rt = new Runtime({ store, tasks: [], llm: {} as never, git: makeGit, webspec: {} as never, searchfox: {} as never });
  return { a, b, baseSha, c1, c2, raw1, raw2, calls, conduit: conduit as unknown as Conduit, rt, session, store,
    setInvalidSecondPatch(v: boolean) { invalidSecondPatch = v; }, setMissingBase(v: boolean) { missingBase = v; },
    setFail(v: boolean) { fail = v; }, setBranching(v: boolean) { branching = v; } };
}

const rev = { host, id: 2 };

// REQUIRES_REAL_GIT
test("imports a stacked revision as local commits without changing checkout state", async () => {
  const x = setup();
  writeFileSync(join(x.a.dir, "dirty.txt"), "dirty\n");
  const before = snapshot(x.a);
  const { base, head } = await importRevision(x.rt, x.session.id, rev, { conduit: x.conduit });
  assert.equal(base, x.baseSha);
  const git = makeGit(x.a.dir);
  const log = await git.log(base, head);
  assert.deepEqual(log.map((c) => c.subject), ["T1", "T2"]);
  assert.deepEqual(log.map(commitRevision), [{ host, id: 1 }, { host, id: 2 }]);
  assert.equal(await git.show(head, "b.txt"), "added\n");
  assert.equal(checkDrift(await git.diff(log[0]!.sha, head), await x.raw2), null);
  assert.equal(checkDrift(await git.diff(base, log[0]!.sha), await x.raw1), null);
  const refs = x.a.git("for-each-ref", "--format=%(refname) %(objectname)", "refs/spatial").split("\n");
  assert.deepEqual(refs.map((line) => line.split(" ")[0]), [`refs/spatial/D1/11-${log[0]!.sha.slice(0, 12)}`, `refs/spatial/D2/22-${log[1]!.sha.slice(0, 12)}`]);
  assert.equal(await git.isAncestor(base, head), true);
  assert.deepEqual(snapshot(x.a), before);
  assert.ok(x.calls.every((method) => READ_ONLY_METHODS.has(method)));
  assert.ok(!x.calls.includes("differential.createinline"));
  const diffRuntime = new Runtime({ store: x.store, tasks: [importDiff], llm: {} as never, git: makeGit, webspec: {} as never, searchfox: {} as never });
  const { diffId } = await diffRuntime.run<{ diffId: string }>(x.session.id, "importDiff", { base, head });
  const diff = x.store.getArtifact<DiffData>(diffId).data;
  assert.deepEqual(diff.commits.map(commitRevision), [{ host, id: 1 }, { host, id: 2 }]);
  const aFile = diff.files.find((file) => file.path === "a.txt")!;
  const aLines = aFile.hunks.flatMap((hunk) => hunk.lines.filter((line) => line.kind === "add"));
  assert.deepEqual(aLines.map((line) => [line.text, line.commit]), [["TWO", 0], ["THREE", 1]]);
  const bFile = diff.files.find((file) => file.path === "b.txt")!;
  assert.equal(hunkCommit(diff, bFile.hunks[0]!), 1);
  assert.ok(aFile.hunks.every((hunk) => {
    const owners = new Set(hunk.lines.filter((line) => line.kind !== "ctx").map((line) => line.commit));
    return owners.size <= 1;
  }));
  const refsBefore = x.a.git("for-each-ref", "--format=%(refname) %(objectname)", "refs/spatial");
  assert.deepEqual(await importRevision(x.rt, x.session.id, rev, { conduit: x.conduit }), { base, head });
  assert.equal(x.a.git("for-each-ref", "--format=%(refname) %(objectname)", "refs/spatial"), refsBefore);
  x.store.close();
});

// REQUIRES_REAL_GIT
test("stops at landed ancestors", async () => {
  const x = setup(true);
  const result = await importRevision(x.rt, x.session.id, rev, { conduit: x.conduit });
  assert.equal((await makeGit(x.a.dir).log(result.base, result.head)).length, 1);
  assert.equal(x.a.git("for-each-ref", "--format=%(refname)", "refs/spatial").trim(), `refs/spatial/D2/22-${result.head.slice(0, 12)}`);
  x.store.close();
});

// REQUIRES_REAL_GIT
test("rejects a missing base before writing refs", async () => {
  const x = setup(); x.setMissingBase(true);
  await assert.rejects(importRevision(x.rt, x.session.id, rev, { conduit: x.conduit }), (e: unknown) => e instanceof ImportRevisionError && e.kind === "precondition" && /Base commit d{40} of D1 .* is not in .*Fetch it/.test(e.message));
  assert.equal(x.a.git("for-each-ref", "refs/spatial").trim(), "");
  x.store.close();
});

// REQUIRES_REAL_GIT
test("rejects an unappliable later patch without publishing refs", async () => {
  const x = setup(); x.setInvalidSecondPatch(true);
  await assert.rejects(importRevision(x.rt, x.session.id, rev, { conduit: x.conduit }), (e: unknown) => e instanceof ImportRevisionError && e.kind === "precondition" && /D2 \(diff 22\): Patch does not apply/.test(e.message));
  assert.equal(x.a.git("for-each-ref", "refs/spatial").trim(), "");
  x.store.close();
});

// REQUIRES_REAL_GIT
test("classifies remote errors, missing revisions, and non-linear stacks", async () => {
  const x = setup(); x.setFail(true);
  await assert.rejects(importRevision(x.rt, x.session.id, rev, { conduit: x.conduit }), (e: unknown) => e instanceof ImportRevisionError && e.kind === "remote");
  x.setFail(false);
  const missing = { async call() { return { data: [] }; } } as unknown as Conduit;
  await assert.rejects(importRevision(x.rt, x.session.id, rev, { conduit: missing }), (e: unknown) => e instanceof ImportRevisionError && e.kind === "remote" && /D2 not found/.test(e.message));
  x.setBranching(true);
  await assert.rejects(importRevision(x.rt, x.session.id, rev, { conduit: x.conduit }), (e: unknown) => e instanceof ImportRevisionError && e.kind === "precondition");
  x.store.close();
});

// REQUIRES_REAL_GIT
test("default conduit requires an arcrc token", async () => {
  const x = setup();
  const old = process.env.SPATIAL_ARCRC_PATH;
  const path = join(x.a.dir, "arcrc"); writeFileSync(path, JSON.stringify({ hosts: {} })); process.env.SPATIAL_ARCRC_PATH = path;
  try {
    await assert.rejects(importRevision(x.rt, x.session.id, rev), (e: unknown) => e instanceof ImportRevisionError && e.kind === "precondition" && /No arcrc token for https:\/\/phab.example.com/.test(e.message));
  } finally {
    if (old === undefined) delete process.env.SPATIAL_ARCRC_PATH; else process.env.SPATIAL_ARCRC_PATH = old;
    x.store.close();
  }
});
