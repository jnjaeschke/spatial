import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, SessionState } from "../../../../src/web/plugin-api.ts";
import { checkResults } from "../../../../src/plugins/implement/web/check-results.ts";

let k = 0;
const art = (data: unknown, epoch: number | null): Artifact => ({ id: `CheckResults${++k}`, sessionId: "s", type: "CheckResults", status: "verified", data, provenance: { taskId: "t" }, epoch, createdAt: "" });
const state = (artifacts: Artifact[]): SessionState => ({ session: { id: "s", worktree: "/r", repoDir: "/r/.git", title: "t", createdAt: "", workflow: "implement" }, artifacts, links: [], tasks: [], epochs: [], lastEventId: 0, textLinks: [], plugins: {} });
const result = (ok: boolean) => ({ step: 0, check: 0, label: "covering-test a.js", ok, message: ok ? "1 run, the last passed" : "no run", runs: ok ? ["r1"] : [] });

test("the check results of an epoch are those of its latest attempt", () => {
  const s = state([art({ results: [result(false)] }, 2), art({ results: [result(true)] }, 2), art({ results: [result(false)] }, 4)]);
  assert.deepEqual(checkResults(s, 2).map((r) => r.ok), [true]);
  assert.deepEqual(checkResults(s, 4).map((r) => r.ok), [false]);
  assert.deepEqual(checkResults(s, 3), []);
  assert.deepEqual(checkResults(s, null), []);
});
