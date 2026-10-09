import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, Epoch } from "../../../src/plugin-api.ts";
import { commentPlan } from "../../../src/plugins/implement/shared/comment-plan.ts";

let n = 0;
const art = (type: string, data: unknown, epoch: number | null): Artifact => ({ id: `${type}${++n}`, sessionId: "s", type, status: "verified", data, provenance: { taskId: "test" }, epoch, createdAt: "" });
const phabComment = (phid: string, version: number, body: string) => art("PhabComment", { revision: 7, phid, version, author: "alice", bot: false, byMe: false, body, own: false, done: false, txId: version, dateCreated: version }, null);
const epoch: Epoch = { sessionId: "s", n: 8, phase: "reviewerComments", status: "running", input: { comments: ["PHID-XCMT-1", "PHID-XCMT-2"] }, error: null, startedAt: "", endedAt: null };

test("commentPlan uses latest comments and lets triage override interpretation", () => {
  const old = phabComment("PHID-XCMT-1", 1, "old");
  const first = phabComment("PHID-XCMT-1", 2, "new");
  const second = phabComment("PHID-XCMT-2", 1, "second");
  const interpretation1 = art("CommentInterpretation", { comment: first.id, phid: "PHID-XCMT-1", asks: "A", proposal: "B", action: "address", reply: null }, 8);
  const interpretation2 = art("CommentInterpretation", { comment: second.id, phid: "PHID-XCMT-2", asks: "C", proposal: "D", action: "reply", reply: "Kept for X." }, 8);
  const triage = art("CommentTriage", { comment: second.id, phid: "PHID-XCMT-2", action: "ignore", text: null }, 9);
  const triaged = commentPlan({ artifacts: [old, first, second, interpretation1, interpretation2, triage] }, epoch);
  assert.deepEqual(triaged.map(({ comment, action, text }) => [comment.data.phid, comment.data.body, action, text]), [
    ["PHID-XCMT-1", "new", "address", null], ["PHID-XCMT-2", "second", "ignore", null],
  ]);
  const suggested = commentPlan({ artifacts: [old, first, second, interpretation1, interpretation2] }, epoch);
  assert.deepEqual(suggested.map(({ action, text }) => [action, text]), [["address", null], ["reply", "Kept for X."]]);
});
