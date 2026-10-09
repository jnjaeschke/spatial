import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact } from "../../../src/plugin-api.ts";
import type { CommentPlanItem } from "../../../src/plugins/implement/shared/comment-plan.ts";
import { commentsFeedback } from "../../../src/plugins/implement/runtime/comments-feedback.ts";

const artifact = <T>(type: string, data: T, epoch: number | null = 8): Artifact<T> => ({ id: type, sessionId: "s", type, status: "verified", data, provenance: { taskId: "t" }, epoch, createdAt: "" });

const address: CommentPlanItem = {
  comment: artifact("PhabComment", { phid: "P1", author: "alice", revision: 7, version: 1, bot: false, byMe: false, own: false, done: false, txId: 1, dateCreated: 0, path: "dom/a.cpp", line: 12, quote: "x = 30;", body: "Name this" }),
  interpretation: artifact("CommentInterpretation", { comment: "P1", phid: "P1", asks: "Name the constant", proposal: "const kMax = 30", action: "address", reply: null }),
  action: "address",
  text: "use kMaxFoo",
};
const reply: CommentPlanItem = { ...address, action: "reply", text: "Thanks" };
const ignore: CommentPlanItem = { ...address, action: "ignore", text: null };

test("formats addressed comments as implement feedback with their source and interpretation", () => {
  assert.equal(commentsFeedback([address, reply, ignore]), `Address these reviewer comments from Phabricator. Keep each commit's \`Differential Revision:\` line.\n\n## alice on D7, dom/a.cpp:12\nCommented line: \`x = 30;\`\nName this\nWhat they ask: Name the constant\nProposed change: const kMax = 30\nAuthor's note: use kMaxFoo`);
  assert.equal(commentsFeedback([reply, ignore]), null);
});
