import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact } from "../../../../src/plugin-api.ts";
import type { PhabCommentData, PhabThreadSummaryData } from "../../../../src/plugins/review/shared/types.ts";
import { currentSummary, phabThreads } from "../../../../src/plugins/review/shared/phab-threads.ts";

const comment = (id: string, values: Partial<PhabCommentData> = {}): Artifact<PhabCommentData> => ({ id, sessionId: "S", type: "PhabComment", status: "verified", provenance: { taskId: "runtime" }, createdAt: id, data: { revision: 1, phid: id, version: 1, author: "alice", bot: false, byMe: false, body: id, own: false, done: false, txId: 1, dateCreated: 1, ...values }, epoch: null });

test("phabThreads follows reply chains, isolates orphans, and uses the latest comment artifact", () => {
  const artifacts = [
    comment("root", { phid: "ROOT", dateCreated: 1 }),
    comment("reply-v1", { phid: "REPLY", replyTo: "ROOT", dateCreated: 2 }),
    comment("reply-v2", { phid: "REPLY", version: 2, replyTo: "ROOT", dateCreated: 2 }),
    comment("chain", { phid: "CHAIN", replyTo: "REPLY", dateCreated: 3 }),
    comment("orphan", { phid: "ORPHAN", replyTo: "MISSING", dateCreated: 4 }),
  ];
  assert.deepEqual(phabThreads(artifacts).map((thread) => [thread.rootPhid, thread.comments.map((item) => item.id)]), [
    ["ROOT", ["root", "reply-v2", "chain"]], ["ORPHAN", ["orphan"]],
  ]);
});

test("currentSummary matches comment phids as a set and rejects subsets", () => {
  const summary: Artifact<PhabThreadSummaryData> = { id: "summary", sessionId: "S", type: "PhabThreadSummary", status: "proposed", provenance: { taskId: "task" }, createdAt: "1", data: { revision: 1, rootPhid: "ROOT", commentPhids: ["A", "B", "C", "D"], summary: "Summary" }, epoch: null };
  assert.equal(currentSummary([summary], "ROOT", ["D", "B", "A", "C"]), summary);
  assert.equal(currentSummary([summary], "ROOT", ["A", "B", "C"]), null);
  assert.equal(currentSummary([summary], "OTHER", ["A", "B", "C", "D"]), null);
});
