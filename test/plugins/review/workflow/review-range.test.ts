// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Runtime, type GitCapability } from "../../../../src/runtime/tasks.ts";
import { Store } from "../../../../src/runtime/store.ts";
import { makeGit } from "../../../../src/runtime/git.ts";
import { importDiff } from "../../../../src/plugins/review/tasks/import-diff/task.ts";
import { reviewRange } from "../../../../src/plugins/review/tasks/review-range/task.ts";
import { MAX_DEFAULT_COMMITS, defaultReviewRange } from "../../../../src/plugins/review/workflow/review-range.ts";
import { analysisStatus } from "../../../../src/plugins/review/web/analysis.ts";
import { makeRepo } from "../../../helpers/git-fixture.ts";

function runtimeFor(dir: string) {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: dir, repoDir: join(dir, ".git"), title: "review" });
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [importDiff] }], git: makeGit, llm: {} as never, webspec: {} as never, searchfox: {} as never });
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
    const range = await defaultReviewRange(session.worktree, rt.gitFor(session.id));
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
    assert.deepEqual(await defaultReviewRange(session.worktree, rt.gitFor(session.id)), { base: "HEAD~1", head: "HEAD" });
    writeFileSync(join(r.dir, "a.txt"), "staged\n");
    r.git("add", "a.txt");
    writeFileSync(join(r.dir, "a.txt"), "new\n");
    assert.deepEqual(await defaultReviewRange(session.worktree, rt.gitFor(session.id)), { base: "HEAD~1", head: "HEAD" });
    assert.equal(r.git("for-each-ref", "refs/spatial"), "");
  } finally { store.close(); }
});

test("defaultReviewRange covers the feature branch since main", async () => {
  const r = makeRepo();
  const forkPoint = r.commit({ "a.txt": "base\n" }, "base");
  r.git("checkout", "-q", "-b", "feature");
  r.commit({ "a.txt": "one\n" }, "one");
  r.commit({ "a.txt": "two\n" }, "two");
  r.commit({ "a.txt": "three\n" }, "three");
  const before = state(r);
  const { store, session, rt } = runtimeFor(r.dir);
  try {
    const range = await defaultReviewRange(session.worktree, rt.gitFor(session.id));
    assert.deepEqual(range, { base: forkPoint, head: "HEAD" });
    assert.deepEqual((await rt.gitFor(session.id).log(range.base, range.head)).map(({ subject }) => subject), ["one", "two", "three"]);
    assert.deepEqual(state(r), before);
  } finally { store.close(); }
});

test("defaultReviewRange finds a master-only repository's fork point", async () => {
  const r = makeRepo();
  const forkPoint = r.commit({ "a.txt": "base\n" }, "base");
  r.git("branch", "-m", "main", "master");
  r.git("checkout", "-q", "-b", "feature");
  r.commit({ "a.txt": "feature\n" }, "feature");
  const { store, session, rt } = runtimeFor(r.dir);
  try {
    assert.deepEqual(await defaultReviewRange(session.worktree, rt.gitFor(session.id)), { base: forkPoint, head: "HEAD" });
  } finally { store.close(); }
});

test("defaultReviewRange forks from the nearest main, not a stale local one", async () => {
  const r = makeRepo();
  r.commit({ "a.txt": "base\n" }, "base");
  r.git("checkout", "-q", "-b", "upstream");
  r.commit({ "a.txt": "upstream 1\n" }, "upstream 1");
  const upstream = r.commit({ "a.txt": "upstream 2\n" }, "upstream 2");
  r.git("update-ref", "refs/remotes/origin/main", upstream);
  r.git("checkout", "-q", "-b", "feature");
  r.commit({ "a.txt": "mine\n" }, "mine");
  const { store, session, rt } = runtimeFor(r.dir);
  try {
    assert.deepEqual(await defaultReviewRange(session.worktree, rt.gitFor(session.id)), { base: upstream, head: "HEAD" });
  } finally { store.close(); }
});

test("defaultReviewRange refuses a range too long to be the user's branch", async () => {
  const r = makeRepo();
  r.commit({ "a.txt": "base\n" }, "base");
  r.git("checkout", "-q", "-b", "feature");
  for (let i = 0; i <= MAX_DEFAULT_COMMITS; i++) r.commit({ "a.txt": `${i}\n` }, `c${i}`);
  const { store, session, rt } = runtimeFor(r.dir);
  try {
    await assert.rejects(defaultReviewRange(session.worktree, rt.gitFor(session.id)), new RegExp(`${MAX_DEFAULT_COMMITS + 1} commits ahead of its nearest main/master`));
  } finally { store.close(); }
});

test("repeated dirty snapshots have the same tree", async () => {
  const r = makeRepo();
  const dir = r.dir;
  r.commit({ "a.txt": "base\n" }, "base");
  writeFileSync(join(dir, "a.txt"), "dirty\n");
  const { store, session, rt } = runtimeFor(dir);
  try {
    const a = await defaultReviewRange(session.worktree, rt.gitFor(session.id));
    const b = await defaultReviewRange(session.worktree, rt.gitFor(session.id));
    assert.equal(r.git("rev-parse", `${a.head}^{tree}`), r.git("rev-parse", `${b.head}^{tree}`));
  } finally { store.close(); }
});

test("failed default range is a failed reviewRange analysis step", async () => {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "review" });
  const rt = new Runtime({
    store, plugins: [{ id: "test", tasks: [reviewRange] }], git: () => ({ isDirty: async () => { throw new Error("git status failed"); } }) as unknown as GitCapability,
    llm: {} as never, webspec: {} as never, searchfox: {} as never,
  });
  try {
    await assert.rejects(rt.run(session.id, "reviewRange", {}), /git status failed/);
    const tasks = store.listTasks(session.id);
    assert.equal(tasks.at(-1)?.kind, "reviewRange");
    assert.equal(tasks.at(-1)?.status, "failed");
    assert.deepEqual(analysisStatus({ tasks, artifacts: [] } as any), {
      state: "failed", step: "reviewRange", error: "git status failed",
    });
  } finally { store.close(); }
});
