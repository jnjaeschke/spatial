import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { postableComments } from "../../src/runtime/postable-comments.ts";

test("postableComments selects latest verified comments for accepted findings only", () => {
  const store = new Store(":memory:");
  const session = store.createSession("/repo", "test");
  const artifact = (type: string, status: "proposed" | "verified", data: unknown) => store.putArtifact({
    sessionId: session.id, type, status, data, provenance: { taskId: "test" },
  });
  const linkAbout = (from: string, to: string) => store.putLink({ sessionId: session.id, from, to, kind: "about" });
  const finding = artifact("ReviewFinding", "proposed", { title: "f1" });
  const unreviewed = artifact("ReviewFinding", "proposed", { title: "f2" });
  const dismissed = artifact("ReviewFinding", "proposed", { title: "f3" });
  const decision = (findingId: string, value: "accepted" | "dismissed") => {
    const valueArtifact = artifact("FindingDecision", "verified", { finding: findingId, decision: value });
    linkAbout(valueArtifact.id, findingId);
  };
  decision(finding.id, "accepted");
  decision(unreviewed.id, "accepted");
  decision(dismissed.id, "accepted");
  decision(dismissed.id, "dismissed");

  const oldComment = artifact("ReviewComment", "verified", { finding: finding.id, body: "old" });
  linkAbout(oldComment.id, finding.id);
  const latestComment = artifact("ReviewComment", "verified", { finding: finding.id, body: "latest" });
  linkAbout(latestComment.id, finding.id);
  const proposedComment = artifact("ReviewComment", "proposed", { finding: unreviewed.id, body: "unreviewed" });
  linkAbout(proposedComment.id, unreviewed.id);
  const dismissedComment = artifact("ReviewComment", "verified", { finding: dismissed.id, body: "dismissed" });
  linkAbout(dismissedComment.id, dismissed.id);

  assert.deepEqual(postableComments(store, session.id).map(({ finding: f, comment }) => [f.id, comment.id]), [[finding.id, latestComment.id]]);

  const receipt = artifact("PostedComment", "verified", { comment: latestComment.id, revision: 1, diff: 2, inlineId: 3 });
  linkAbout(receipt.id, latestComment.id);
  assert.deepEqual(postableComments(store, session.id), []);
  store.close();
});
