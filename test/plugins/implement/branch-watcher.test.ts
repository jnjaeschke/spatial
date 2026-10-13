import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { makeRepo } from "../../helpers/git-fixture.ts";
import { testRuntime } from "../../helpers/runtime.ts";
import { makeGit } from "../../../src/runtime/git/read.ts";
import { BranchWatcher, branchState } from "../../../src/plugins/implement/runtime/branch-watcher.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";

function setup() {
  const repo = makeRepo();
  const base = repo.commit({ "a.txt": "base\n" }, "base");
  repo.git("switch", "-q", "-c", "topic");
  const head = repo.commit({ "a.txt": "topic\n" }, "topic");
  const { rt, store, session } = testRuntime({ plugins: [specPlugin, reviewPlugin, implementPlugin], git: () => makeGit(repo.dir), session: { worktree: repo.dir, repoDir: join(repo.dir, ".git"), workflow: "implement" } });
  const put = (type: string, data: unknown, epoch?: number) => store.putArtifact({ sessionId: session.id, type, status: "verified", data, provenance: { taskId: "test" }, ...(epoch ? { epoch } : {}) });
  put("WorkflowStart", {});
  put("ImplementBranch", { branch: "topic", baseSha: base, baseRef: "main", checkout: "new-branch" });
  put("Diff", { baseSha: base, headSha: head, commits: [], files: [] });
  return { repo, rt, store, session, put };
}

test("watcher notifies once when a branch moves, and stays quiet at known heads", async () => {
  const { repo, rt, session, put } = setup();
  const watcher = new BranchWatcher(rt);
  const events: unknown[] = [];
  rt.onEvent((e) => { if (e.type === "notify") events.push(e.payload); });
  watcher.watch(session.id);
  await watcher.tick();
  assert.deepEqual(events, []);
  const moved = repo.commit({ "a.txt": "moved\n" }, "moved");
  await watcher.tick();
  await watcher.tick();
  assert.deepEqual(events, [{ id: `branch-moved:${moved}`, title: "Branch topic moved outside spatial", action: { label: "Adopt", path: `/api/sessions/${session.id}/adopt` } }]);
  const submitted = repo.commit({ "a.txt": "submitted\n" }, "submitted");
  put("PhabSubmission", { head: submitted });
  await watcher.tick();
  assert.equal(events.length, 1);
});

test("the adopted branch tip is known even when the selected range ended earlier", async () => {
  const { repo, rt, store, session, put } = setup();
  const oldHead = repo.git("rev-parse", "HEAD");
  const tip = repo.commit({ "a.txt": "later\n" }, "kept out of adopted range");
  const planId = put("AdoptPlan", { branches: [{ branch: "topic", tip }] }).id;
  store.createEpoch(session.id, "adoptRange", { planId, branch: "topic", head: oldHead });
  const events: unknown[] = [];
  rt.onEvent((e) => { if (e.type === "notify") events.push(e.payload); });
  const watcher = new BranchWatcher(rt);
  watcher.watch(session.id);
  await watcher.tick();
  assert.deepEqual(events, []);
});

test("watcher detects renamed related branches and offers choose when none match", async () => {
  const { repo, rt, session, put } = setup();
  put("Investigation", { bug: 2072138 });
  const watcher = new BranchWatcher(rt), events: any[] = [];
  rt.onEvent((e) => { if (e.type === "notify") events.push(e.payload); });
  watcher.watch(session.id);
  repo.git("branch", "-m", "topic", "bug-2072138");
  repo.commit({ "b.txt": "b\n" }, "Bug 2072138 - x");
  await watcher.tick();
  assert.equal(events[0].title, "Branch topic is gone; found bug-2072138");
  assert.equal(events[0].action.label, "Adopt");
  repo.git("switch", "-q", "main");
  repo.git("branch", "-D", "bug-2072138");
  await watcher.tick();
  assert.equal(events.at(-1).action.label, "Choose branch");
  assert.equal(events.at(-1).title, "Branch topic is gone and no related branch was found");
});

test("watcher polls only watched idle implement sessions", async () => {
  const { repo, rt, session } = setup();
  const watcher = new BranchWatcher(rt);
  let calls = 0;
  const git = rt.gitFor.bind(rt);
  rt.gitFor = (id) => { calls++; return git(id); };
  await watcher.tick();
  assert.equal(calls, 0);
  watcher.watch(session.id);
  rt.runningEpoch = () => ({}) as any;
  await watcher.tick();
  assert.equal(calls, 0);
  assert.equal(await branchState(makeGit(repo.dir), { artifacts: [], epochs: [] } as any), null);
});
