import { test } from "node:test";
import assert from "node:assert/strict";
import { postableComments } from "../../src/shared/postable-comments.ts";
import type { Artifact, Link } from "../../src/shared/types.ts";

test("postableComments selects latest verified comments for accepted findings only", () => {
  const session = { id: "S" };
  const artifacts: Artifact[] = [];
  const links: Link[] = [];
  const putArtifact = (type: string, status: "proposed" | "verified", data: unknown) => {
    const value = { id: `A${artifacts.length}`, sessionId: session.id, type, status, data, provenance: { taskId: "test" }, createdAt: `${artifacts.length}` } as Artifact;
    artifacts.push(value);
    return value;
  };
  const linkAbout = (from: string, to: string) => links.push({ id: `L${links.length}`, sessionId: session.id, from, to, kind: "about" });
  const finding = putArtifact("ReviewFinding", "proposed", { title: "f1" });
  links.push({ id: "narrative-link", sessionId: session.id, from: finding.id, to: "N1", kind: "derivedFrom" });
  const unreviewed = putArtifact("ReviewFinding", "proposed", { title: "f2" });
  const dismissed = putArtifact("ReviewFinding", "proposed", { title: "f3" });
  const decision = (findingId: string, value: "accepted" | "dismissed") => {
    const valueArtifact = putArtifact("FindingDecision", "verified", { finding: findingId, decision: value });
    linkAbout(valueArtifact.id, findingId);
  };
  decision(finding.id, "accepted");
  decision(unreviewed.id, "accepted");
  decision(dismissed.id, "accepted");
  decision(dismissed.id, "dismissed");

  const oldComment = putArtifact("ReviewComment", "verified", { finding: finding.id, body: "old" });
  linkAbout(oldComment.id, finding.id);
  const latestComment = putArtifact("ReviewComment", "verified", { finding: finding.id, body: "latest" });
  linkAbout(latestComment.id, finding.id);
  const proposedComment = putArtifact("ReviewComment", "proposed", { finding: unreviewed.id, body: "unreviewed" });
  linkAbout(proposedComment.id, unreviewed.id);
  const dismissedComment = putArtifact("ReviewComment", "verified", { finding: dismissed.id, body: "dismissed" });
  linkAbout(dismissedComment.id, dismissed.id);

  assert.deepEqual(postableComments({ artifacts, links }, "N1").map(({ finding: f, comment }) => [f.id, comment.id]), [[finding.id, latestComment.id]]);

  const receipt = putArtifact("PostedComment", "verified", { comment: latestComment.id, revision: 1, diff: 2, inlineId: 3 });
  linkAbout(receipt.id, latestComment.id);
  assert.deepEqual(postableComments({ artifacts, links }, "N1"), []);
});

test("postableComments only considers findings from the requested narrative", () => {
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, data: {}, provenance: { taskId: "t" }, createdAt: "1" } as Artifact;
  const decision = { id: "DEC", sessionId: "S", type: "FindingDecision", status: "verified" as const, data: { finding: "F", decision: "accepted" }, provenance: { taskId: "t" }, createdAt: "2" } as Artifact;
  const comment = { id: "C", sessionId: "S", type: "ReviewComment", status: "verified" as const, data: { finding: "F", body: "Ready" }, provenance: { taskId: "t" }, createdAt: "3" } as Artifact;
  const links: Link[] = [
    { id: "d", sessionId: "S", from: decision.id, to: finding.id, kind: "about" },
    { id: "c", sessionId: "S", from: comment.id, to: finding.id, kind: "about" },
    { id: "n", sessionId: "S", from: finding.id, to: "N1", kind: "derivedFrom" },
  ];
  const state = { artifacts: [finding, decision, comment], links };
  assert.deepEqual(postableComments(state, "N2"), []);
  assert.deepEqual(postableComments(state, null), []);
});
