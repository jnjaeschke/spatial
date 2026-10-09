import { test } from "node:test";
import assert from "node:assert/strict";
import { tryHeadline } from "../../../../src/plugins/gecko/web/try-status.ts";
import type { TryRunData } from "../../../../src/plugins/gecko/shared/types.ts";

const run = (over: Partial<TryRunData>): TryRunData => ({ push: "p", url: "u", revision: "abc", pushId: 7, counts: {}, complete: false, failures: [], error: null, ...over });

test("tryHeadline says waiting, the Treeherder error, or the job counts", () => {
  assert.equal(tryHeadline(null), "Waiting for Treeherder…");
  assert.equal(tryHeadline(run({ error: "No push found for revision" })), "Treeherder: No push found for revision");
  assert.equal(tryHeadline(run({ counts: { completed: 3, running: 2, pending: 1 }, failures: [{ jobId: 1, name: "n", platform: "p", result: "testfailed", errors: [] }] })), "Running: 3 done, 2 running, 1 pending, 1 failing");
  assert.equal(tryHeadline(run({ counts: { completed: 6 }, complete: true })), "Finished: 6 done, all passed");
});
