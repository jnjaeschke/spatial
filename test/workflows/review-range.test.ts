// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Runtime } from "../../src/runtime/tasks.ts";
import { Store } from "../../src/runtime/store.ts";
import { makeGit } from "../../src/runtime/git.ts";
import { importDiff } from "../../src/tasks/import-diff/task.ts";
import { defaultReviewRange } from "../../src/workflows/review-range.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

function runtimeFor(dir: string) {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: dir, repoDir: join(dir, ".git"), title: "review" });
  const rt = new Runtime({ store, tasks: [importDiff], git: makeGit, llm: {} as never, webspec: {} as never, searchfox: {} as never });
  return { store, session, rt };
}

function state(r: ReturnType<typeof makeRepo>) {
  return {
    head: r.git("rev-parse", "HEAD"), branch: r.git("symbolic-ref", "HEAD"),
    status: r.git("--no-optional-locks", "status", "--porcelain"), refs: r.git("for-each-ref", "refs/heads", "refs/tags", "refs/remotes"),
    index: readFileSync(join(r.dir, ".git", "index")), files: readdirSync(r.dir).sort(),
  };
}

test("defaultReviewRange snapshots dirty worktrees for importDiff", async () => {
  const r = makeRepo();
  const base = r.commit({ "a.txt": "old\n", ".gitignore": "ignored.log\n" }, "base");
  r.commit({ "a.txt": "second\n", ".gitignore": "ignored.log\n" }, "second");
  writeFileSync(join(r.dir, "a.txt"), "dirty\n");
  writeFileSync(join(r.dir, "s.txt"), "staged\n");
  r.git("add", "s.txt");
  writeFileSync(join(r.dir, "u.txt"), "untracked\n");
  writeFileSync(join(r.dir, "ignored.log"), "ignored\n");
  const before = state(r);
  const { store, session, rt } = runtimeFor(r.dir);
  try {
    const range = await defaultReviewRange(rt, session.id);
    assert.equal(range.base, r.git("rev-parse", "HEAD"));
    assert.match(range.head, /^refs\/spatial\/worktree\/[0-9a-f]{12}$/);
    assert.equal(r.git("rev-parse", `${range.head}^`), range.base);
    assert.equal(r.git("for-each-ref", "--format=%(refname)", "refs/spatial"), range.head);
    assert.deepEqual(state(r), before);
    await rt.run(session.id, "importDiff", range);
    const diff = store.listArtifacts(session.id, "Diff")[0]!.data as { files: { path: string }[]; headSha: string };
    assert.deepEqual(diff.files.map((file) => file.path), ["a.txt", "s.txt", "u.txt"]);
    assert.equal(diff.headSha, r.git("rev-parse", range.head));
    assert.notEqual(base, range.base);
  } finally { store.close(); }
});

test("defaultReviewRange uses latest commit when clean or tree-equivalent dirty", async () => {
  const r = makeRepo();
  r.commit({ "a.txt": "old\n" }, "base");
  r.commit({ "a.txt": "new\n" }, "second");
  const { store, session, rt } = runtimeFor(r.dir);
  try {
    assert.deepEqual(await defaultReviewRange(rt, session.id), { base: "HEAD~1", head: "HEAD" });
    writeFileSync(join(r.dir, "a.txt"), "staged\n");
    r.git("add", "a.txt");
    writeFileSync(join(r.dir, "a.txt"), "new\n");
    assert.deepEqual(await defaultReviewRange(rt, session.id), { base: "HEAD~1", head: "HEAD" });
    assert.equal(r.git("for-each-ref", "refs/spatial"), "");
  } finally { store.close(); }
});

test("repeated dirty snapshots have the same tree", async () => {
  const r = makeRepo();
  const dir = r.dir;
  r.commit({ "a.txt": "base\n" }, "base");
  writeFileSync(join(dir, "a.txt"), "dirty\n");
  const { store, session, rt } = runtimeFor(dir);
  try {
    const a = await defaultReviewRange(rt, session.id);
    const b = await defaultReviewRange(rt, session.id);
    assert.equal(r.git("rev-parse", `${a.head}^{tree}`), r.git("rev-parse", `${b.head}^{tree}`));
  } finally { store.close(); }
});
