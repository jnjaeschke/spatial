import { test } from "node:test";
import assert from "node:assert/strict";
import { postableComments } from "../../../../src/plugins/review/shared/postable-comments.ts";
import type { Artifact, Link } from "../../../../src/shared/types.ts";

test("postableComments selects latest verified comments for accepted findings only", () => {
  const session = { id: "S" };
  const artifacts: Artifact[] = [
    { id: "D1", sessionId: "S", type: "Diff", status: "verified", data: { baseSha: "b", headSha: "h", commits: [], files: [] }, provenance: { taskId: "t" }, createdAt: "0", epoch: null},
    { id: "N1", sessionId: "S", type: "PatchNarrative", status: "proposed", data: { diffId: "D1", summary: "n", changes: [] }, provenance: { taskId: "t" }, createdAt: "1", epoch: null},
    { id: "D2", sessionId: "S", type: "Diff", status: "verified", data: { baseSha: "b", headSha: "h2", commits: [], files: [] }, provenance: { taskId: "t" }, createdAt: "2", epoch: null},
    { id: "N2", sessionId: "S", type: "PatchNarrative", status: "proposed", data: { diffId: "D2", summary: "n2", changes: [] }, provenance: { taskId: "t" }, createdAt: "3", epoch: null},
  ];
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
  const d1 = { id: "D1", sessionId: "S", type: "Diff", status: "verified" as const, data: { baseSha: "b", headSha: "h", commits: [], files: [] }, provenance: { taskId: "t" }, createdAt: "0" } as Artifact;
  const n1 = { id: "N1", sessionId: "S", type: "PatchNarrative", status: "proposed" as const, data: { diffId: "D1", summary: "n", changes: [] }, provenance: { taskId: "t" }, createdAt: "1" } as Artifact;
  const d2 = { id: "D2", sessionId: "S", type: "Diff", status: "verified" as const, data: { baseSha: "b", headSha: "h2", commits: [], files: [] }, provenance: { taskId: "t" }, createdAt: "2" } as Artifact;
  const n2 = { id: "N2", sessionId: "S", type: "PatchNarrative", status: "proposed" as const, data: { diffId: "D2", summary: "n2", changes: [] }, provenance: { taskId: "t" }, createdAt: "3" } as Artifact;
  const state = { artifacts: [d1, n1, d2, n2, finding, decision, comment], links };
  assert.deepEqual(postableComments(state, "N2"), []);
  assert.deepEqual(postableComments(state, null), []);
});

test("postableComments uses carried lines and excludes outdated or addressed findings", () => {
  const artifacts: Artifact[] = [
    { id: "D1", sessionId: "S", type: "Diff", status: "verified", data: { baseSha: "b", headSha: "h", commits: [], files: [] }, provenance: { taskId: "t" }, createdAt: "0", epoch: null},
    { id: "N1", sessionId: "S", type: "PatchNarrative", status: "proposed", data: { diffId: "D1", summary: "n1", changes: [] }, provenance: { taskId: "t" }, createdAt: "1", epoch: null},
    { id: "D2", sessionId: "S", type: "Diff", status: "verified", data: { baseSha: "b", headSha: "h2", commits: [], files: [] }, provenance: { taskId: "t" }, createdAt: "2", epoch: null},
    { id: "N2", sessionId: "S", type: "PatchNarrative", status: "proposed", data: { diffId: "D2", summary: "n2", changes: [] }, provenance: { taskId: "t" }, createdAt: "3", epoch: null},
  ];
  const links: Link[] = [];
  const put = (id: string, type: string, status: "proposed" | "verified", data: unknown) => {
    const value = { id, sessionId: "S", type, status, data, provenance: { taskId: "t" }, createdAt: id } as Artifact;
    artifacts.push(value);
    return value;
  };
  const finding = (id: string) => put(id, "ReviewFinding", "proposed", { anchor: "D1#f0h0", category: "correctness", severity: "low", title: id, body: "body" });
  const f1 = finding("F1"), f2 = finding("F2"), f3 = finding("F3"), f4 = finding("F4");
  const carry = (id: string, findingId: string, hunkId: string | null) => {
    const c = put(id, "FindingCarry", "verified", { finding: findingId, toDiff: "D2", hunkId, ...(hunkId ? { lines: { path: "a.ts", side: "new", start: 8, end: 8 } } : {}) });
    links.push({ id: `${id}-about`, sessionId: "S", from: c.id, to: findingId, kind: "about" });
  };
  for (const f of [f1, f2, f3, f4]) links.push({ id: `${f.id}-n1`, sessionId: "S", from: f.id, to: "N1", kind: "derivedFrom" });
  carry("C1", "F1", "f0h0"); carry("C2", "F2", null); carry("C3", "F3", "f0h0"); carry("C4", "F4", "f0h0");
  const addDecision = (id: string, f: Artifact, decision: "accepted") => {
    const a = put(id, "FindingDecision", "verified", { finding: f.id, decision });
    links.push({ id: `${id}-about`, sessionId: "S", from: id, to: f.id, kind: "about" });
  };
  addDecision("DEC1", f1, "accepted"); addDecision("DEC2", f2, "accepted"); addDecision("DEC3", f3, "accepted"); addDecision("DEC4", f4, "accepted");
  const verdict = put("V3", "FindingVerdict", "proposed", { finding: "F3", verdict: "addressed", reason: "Fixed" });
  links.push({ id: "V3-about", sessionId: "S", from: verdict.id, to: "F3", kind: "about" });
  for (const [id, f] of [["CMT1", f1], ["CMT2", f2], ["CMT3", f3], ["CMT4", f4]] as const) {
    const c = put(id, "ReviewComment", "verified", { finding: f.id, body: "Ready" });
    links.push({ id: `${id}-about`, sessionId: "S", from: c.id, to: f.id, kind: "about" });
  }
  assert.deepEqual(postableComments({ artifacts, links }, "N2").map(({ finding: f, lines }) => [f.id, lines]), [["F1", { path: "a.ts", side: "new", start: 8, end: 8 }], ["F4", { path: "a.ts", side: "new", start: 8, end: 8 }]]);
});
