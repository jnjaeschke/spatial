import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../src/runtime/store.ts";
import type { NotifyPayload } from "../../../src/plugin-api.ts";
import type { TryRunData } from "../../../src/plugins/gecko/shared/types.ts";
import { TryWatcher, isComplete, parseTreeherderJson } from "../../../src/plugins/gecko/runtime/try-watcher.ts";

const failingJson = (n: number) => JSON.stringify({ revision: "abc", push_id: 7, matched_jobs: 9, jobs: Array.from({ length: n }, (_, i) => ({
  job: { id: 100 + i, job_type_name: `test-linux-mochitest-${i}`, job_type_symbol: "M", platform: "linux64", platform_option: "opt", result: "testfailed", state: "completed", failure_classification_id: 1 },
  errors: [{ action: "test_result", line: 1, test: "dom/base/test/test_a.html", status: "FAIL", message: "expected 1, got 2" }, { action: "log", line: 2, signature: "crash in Foo" }],
  log_matches: [],
})) });

function setup(script: { out: { code: number; stdout: string; stderr?: string }[]; status: Record<string, number>[] }) {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/w", repoDir: "/w/.git", title: "t" });
  const push = store.putArtifact({ sessionId: session.id, type: "TryPush", status: "verified", provenance: { taskId: "t" }, data: { command: "./mach try auto", url: "https://treeherder.mozilla.org/jobs?repo=try&landoCommitID=42", head: "HEAD1" } });
  const notices: NotifyPayload[] = [], created: string[] = [];
  const rt = { store, emit: (_s: string, _source: string, type: string, payload: unknown) => { if (type === "notify") notices.push(payload as NotifyPayload); if (type === "artifact.created") created.push((payload as { type: string }).type); } };
  let calls = 0, statusCalls = 0;
  const watcher = new TryWatcher(rt as never, {
    treeherder: async () => ({ stderr: "", ...script.out[Math.min(calls++, script.out.length - 1)]! }),
    status: async () => script.status[Math.min(statusCalls++, script.status.length - 1)]!,
  });
  const runs = () => store.listArtifacts(session.id, "TryRun").map((a) => a.data as TryRunData);
  return { store, watcher, runs, notices, created, push };
}

test("parseTreeherderJson keeps failing jobs and readable error lines; plain text is a version error", () => {
  const parsed = parseTreeherderJson(failingJson(1));
  assert.equal(parsed.revision, "abc");
  assert.equal(parsed.pushId, 7);
  assert.deepEqual(parsed.failures, [{ jobId: 100, name: "test-linux-mochitest-0", platform: "linux64", result: "testfailed", errors: [{ test: "dom/base/test/test_a.html", message: "FAIL expected 1, got 2" }, { test: null, message: "crash in Foo" }] }]);
  assert.throws(() => parseTreeherderJson("12 passing jobs across 2 platforms, no failures found\n"), /0\.3\.0 or later.*12 passing jobs/);
});

test("isComplete needs finished jobs and nothing pending or running", () => {
  assert.equal(isComplete({ completed: 5, pending: 0, running: 0, unscheduled: 200 }), true);
  assert.equal(isComplete({ completed: 5, running: 1 }), false);
  assert.equal(isComplete({}), false);
});

test("a TryRun is stored only on change; failures and completion notify once", async () => {
  const { watcher, runs, notices, created, push } = setup({
    out: [{ code: 0, stdout: failingJson(1) }, { code: 0, stdout: failingJson(1) }, { code: 0, stdout: failingJson(2) }],
    status: [{ completed: 3, running: 2, pending: 1 }, { completed: 3, running: 2, pending: 1 }, { completed: 6, running: 0, pending: 0 }],
  });
  await watcher.tick();
  await watcher.tick();
  assert.equal(runs().length, 1);
  assert.deepEqual({ ...runs()[0]!, failures: runs()[0]!.failures.length }, { push: push.id, url: push.data.url, revision: "abc", pushId: 7, counts: { completed: 3, running: 2, pending: 1 }, complete: false, failures: 1, error: null });
  await watcher.tick();
  assert.equal(runs().length, 2);
  assert.equal(runs()[1]!.complete, true);
  await watcher.tick();
  assert.equal(runs().length, 2, "a complete push is not polled again");
  assert.deepEqual(notices.map((n) => n.title), ["Try: 1 failing job", "Try finished: 2 failing jobs"]);
  assert.deepEqual(created, ["TryRun", "TryRun"]);
});

test("an unreadable push is stored once as an error and replaced when Treeherder answers", async () => {
  const { watcher, runs } = setup({
    out: [{ code: 1, stdout: "", stderr: "Error: No push found for revision" }, { code: 1, stdout: "", stderr: "Error: No push found for revision" }, { code: 0, stdout: JSON.stringify({ revision: "abc", push_id: 7, matched_jobs: 0, jobs: [] }) }],
    status: [{ completed: 4, running: 0, pending: 0 }],
  });
  await watcher.tick();
  await watcher.tick();
  assert.equal(runs().length, 1);
  assert.match(runs()[0]!.error!, /No push found/);
  await watcher.tick();
  assert.equal(runs().length, 2);
  assert.equal(runs()[1]!.error, null);
  assert.equal(runs()[1]!.complete, true);
});

test("a new watcher resumes pushes stored before it started", async () => {
  const first = setup({ out: [{ code: 0, stdout: failingJson(1) }], status: [{ completed: 1, running: 1 }] });
  await first.watcher.tick();
  const restarted = new TryWatcher({ store: first.store, emit: () => {} } as never, {
    treeherder: async () => ({ code: 0, stdout: failingJson(1), stderr: "" }),
    status: async () => ({ completed: 2, running: 0, pending: 0 }),
  });
  await restarted.tick();
  assert.deepEqual(first.runs().map((run) => run.complete), [false, true]);
});
