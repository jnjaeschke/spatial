import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, Link } from "../../../src/plugin-api.ts";
import { describeFinding, openHighFindings } from "../../../src/plugins/implement/runtime/findings.ts";

let n = 0;
const art = (type: string, data: unknown): Artifact => ({ id: `${type}${++n}`, sessionId: "s", type, status: "verified", data, provenance: { taskId: "t" }, epoch: 1, createdAt: "" });
const finding = (severity: string) => art("ReviewFinding", { anchor: "d#f0h0", severity, title: `T ${severity}`, body: "B", lines: { path: "a.cpp", start: 7 } });
const about = (from: Artifact, to: Artifact): Link => ({ id: `l${++n}`, sessionId: "s", from: from.id, to: to.id, kind: "about" });

test("only high findings count, and dismissed or addressed ones stop counting", () => {
  const high = finding("high"), low = finding("low"), dismissed = finding("high"), addressed = finding("high"), partial = finding("high"), accepted = finding("high");
  const dismiss = art("FindingDecision", { finding: dismissed.id, decision: "dismissed" });
  const done = art("FindingVerdict", { finding: addressed.id, verdict: "addressed", reason: "r" });
  const part = art("FindingVerdict", { finding: partial.id, verdict: "partially", reason: "r" });
  const accept = art("FindingDecision", { finding: accepted.id, decision: "accepted" });
  const artifacts = [high, low, dismissed, addressed, partial, accepted, dismiss, done, part, accept];
  const links = [about(dismiss, dismissed), about(done, addressed), about(part, partial), about(accept, accepted)];
  assert.deepEqual(openHighFindings({ artifacts, links }).map((f) => f.id), [high.id, partial.id, accepted.id]);
});

test("a later verdict wins over an earlier one", () => {
  const f = finding("high");
  const early = art("FindingVerdict", { finding: f.id, verdict: "not_addressed", reason: "r" });
  const late = art("FindingVerdict", { finding: f.id, verdict: "addressed", reason: "r" });
  assert.deepEqual(openHighFindings({ artifacts: [f, early, late], links: [about(early, f), about(late, f)] }), []);
});

test("a finding is described with its place", () => {
  assert.equal(describeFinding(finding("high") as Artifact<never>), "- [high] T high (a.cpp:7)\n  B");
});
