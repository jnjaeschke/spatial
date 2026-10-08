import { test } from "node:test";
import assert from "node:assert/strict";
import { findingStates } from "../../../../src/plugins/review/shared/findings.ts";
import type { ReviewFindingData } from "../../../../src/plugins/review/shared/types.ts";
import type { Artifact, Link, PatchNarrativeData } from "../../../../src/shared/types.ts";

const a = <T,>(id: string, type: string, data: T): Artifact<T> => ({ id, sessionId: "S", type, status: "verified", data, provenance: { taskId: "t" }, createdAt: id, epoch: null});
const link = (from: string, to: string, kind: Link["kind"]): Link => ({ id: `${from}-${to}-${kind}`, sessionId: "S", from, to, kind });
const narrative = (id: string, diffId: string): Artifact<PatchNarrativeData> => a(id, "PatchNarrative", { diffId, summary: "", changes: [] });
const finding = (id: string, narrativeId: string): Artifact<ReviewFindingData> => a(id, "ReviewFinding", { anchor: "D1#f0h0", quote: "code", lines: { path: "a", side: "new", start: 1, end: 1 }, category: "style", severity: "low", title: id, body: "body" });

test("findingStates combines own and latest carried state, decisions, and verdicts", () => {
  const f = finding("F", "N1");
  const f2 = finding("F2", "N1");
  const artifacts = [a("D1", "Diff", {}), narrative("N1", "D1"), a("D2", "Diff", {}), narrative("N2", "D2"), f, f2,
    a("C1", "FindingCarry", { finding: "F", toDiff: "D2", hunkId: "old" }),
    a("C2", "FindingCarry", { finding: "F", toDiff: "D2", hunkId: "f0h0", lines: { path: "a", side: "new", start: 20, end: 20 } }),
    a("C3", "FindingCarry", { finding: "F2", toDiff: "D2", hunkId: null }),
    a("A", "FindingDecision", { finding: "F", decision: "accepted" }),
    a("V", "FindingVerdict", { finding: "F", verdict: "addressed", reason: "fixed" }),
    a("D", "FindingDecision", { finding: "F", decision: "dismissed" }),
  ];
  const links = [link("F", "N1", "derivedFrom"), link("F2", "N1", "derivedFrom"), link("C1", "F", "about"), link("C2", "F", "about"), link("C3", "F2", "about"), link("A", "F", "about"), link("V", "F", "about"), link("D", "F", "about")];
  const prior = findingStates({ artifacts, links }, "N1");
  assert.equal(prior.length, 2);
  assert.equal(prior[0]!.status, "dismissed");
  assert.equal(prior[0]!.collapsedByDefault, true);
  const current = findingStates({ artifacts, links }, "N2");
  assert.equal(current.length, 2);
  assert.deepEqual({ anchor: current[0]!.anchor, lines: current[0]!.lines, epoch: current[0]!.epoch, status: current[0]!.status }, { anchor: "D2#f0h0", lines: { path: "a", side: "new", start: 20, end: 20 }, epoch: 1, status: "dismissed" });
  assert.equal(current[1]!.outdated, true);
  assert.equal(current[1]!.quote, undefined);
  assert.equal(current[1]!.collapsedByDefault, true);
});

test("findingStates keeps only carried prior findings and applies verdict collapse defaults", () => {
  const f = finding("F", "N1"), noCarry = finding("G", "N1"), addressed = a("V", "FindingVerdict", { finding: "F", verdict: "addressed", reason: "done" });
  const artifacts = [a("D1", "Diff", {}), narrative("N1", "D1"), a("D2", "Diff", {}), narrative("N2", "D2"), f, noCarry, a("C", "FindingCarry", { finding: "F", toDiff: "D2", hunkId: "h" }), addressed];
  const links = [link("F", "N1", "derivedFrom"), link("G", "N1", "derivedFrom"), link("C", "F", "about"), link("V", "F", "about")];
  assert.equal(findingStates({ artifacts, links }, "N2").length, 1);
  const state = findingStates({ artifacts, links }, "N2")[0]!;
  assert.equal(state.status, "addressed");
  assert.equal(state.collapsedByDefault, true);
  assert.throws(() => findingStates({ artifacts, links }, "D1"), /PatchNarrative/);
});
