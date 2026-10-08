import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { ArtifactStatus, DiffData, FindingCarryData, PatchNarrativeData, ReviewFindingData } from "../../src/shared/types.ts";
import { carryFindings } from "../../src/tasks/carry-findings/task.ts";

const diff = (text: string, line: number): DiffData => ({ baseSha: "b", headSha: text, commits: [], files: [{ path: "a.cpp", status: "modified", binary: false, hunks: [
  { id: "f0h0", header: "@@", oldStart: line, oldLines: 1, newStart: line, newLines: 1, lines: [{ kind: "add", text }] },
] }] });
const narrativeData = (diffId: string, changes = [{ id: "c1", title: "change", explanation: "e", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] }]): PatchNarrativeData => ({ diffId, summary: "summary", changes });

function setup() {
  const store = new Store(":memory:");
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [carryFindings] }], llm: { defaultSelection: { backend: "claude", model: "m", effort: "low" }, async run() { throw new Error("unexpected LLM call"); }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } }, git: () => ({}) as GitCapability, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const put = <T,>(type: string, data: T, status: ArtifactStatus = "verified") => store.putArtifact({ sessionId: session.id, type, status, data, provenance: { taskId: "x" } });
  return { store, rt, session, put };
}

test("carryFindings reanchors visible findings and marks missing quotes outdated", async () => {
  const { store, rt, session, put } = setup();
  const d1 = put("Diff", diff("needle", 2));
  const n1 = put("PatchNarrative", narrativeData(d1.id));
  store.putLink({ sessionId: session.id, from: n1.id, to: d1.id, kind: "derivedFrom" });
  const makeFinding = (data: ReviewFindingData) => {
    const finding = put("ReviewFinding", data, "proposed");
    store.putLink({ sessionId: session.id, from: finding.id, to: n1.id, kind: "derivedFrom" });
    store.putLink({ sessionId: session.id, from: finding.id, to: data.anchor, kind: "about" });
    return finding;
  };
  const quoted = makeFinding({ anchor: `${d1.id}#f0h0`, quote: "needle", lines: { path: "a.cpp", side: "new", start: 2, end: 2 }, category: "correctness", severity: "high", title: "quoted", body: "body" });
  const gone = makeFinding({ anchor: `${d1.id}#f0h0`, quote: "removed", lines: { path: "a.cpp", side: "new", start: 2, end: 2 }, category: "correctness", severity: "high", title: "gone", body: "body" });
  const quoteLess = makeFinding({ anchor: `${n1.id}#c1`, category: "style", severity: "low", title: "signature", body: "body" });
  const dismissed = makeFinding({ anchor: `${d1.id}#f0h0`, quote: "needle", lines: { path: "a.cpp", side: "new", start: 2, end: 2 }, category: "correctness", severity: "low", title: "dismissed", body: "body" });
  const decision = put("FindingDecision", { finding: dismissed.id, decision: "dismissed" }, "verified");
  store.putLink({ sessionId: session.id, from: decision.id, to: dismissed.id, kind: "about" });
  const oldData = diff("needle", 8);
  oldData.files[0].hunks.push({ id: "f0h1", header: "@@", oldStart: 20, oldLines: 1, newStart: 20, newLines: 1, lines: [{ kind: "add", text: "stable" }] });
  const d2 = put("Diff", oldData);
  const n2 = put("PatchNarrative", narrativeData(d2.id));
  store.putLink({ sessionId: session.id, from: n2.id, to: d2.id, kind: "derivedFrom" });
  assert.deepEqual(await rt.run(session.id, "carryFindings", { narrativeId: n2.id }), { carried: 4, outdated: 1 });
  const carries = store.listArtifacts(session.id, "FindingCarry").map((a) => a.data as FindingCarryData);
  assert.deepEqual(carries.map((item) => [item.finding, item.hunkId]), [[quoted.id, "f0h0"], [gone.id, null], [quoteLess.id, "f0h0"], [dismissed.id, "f0h0"]]);
  const carryArtifacts = store.listArtifacts(session.id, "FindingCarry");
  assert.ok(carryArtifacts.every((item) => item.status === "verified" && !item.provenance.llm && store.listLinks(session.id).filter((link) => link.from === item.id && link.kind === "about").length === 1));
  assert.deepEqual(carryArtifacts[0].data && (carryArtifacts[0].data as FindingCarryData).lines, { path: "a.cpp", side: "new", start: 8, end: 8 });

  const d3Data = diff("needle", 12);
  d3Data.files[0].hunks.push({ id: "f0h1", header: "@@", oldStart: 2, oldLines: 1, newStart: 2, newLines: 1, lines: [{ kind: "add", text: "needle" }] });
  const d3 = put("Diff", d3Data);
  const n3 = put("PatchNarrative", narrativeData(d3.id));
  store.putLink({ sessionId: session.id, from: n3.id, to: d3.id, kind: "derivedFrom" });
  assert.deepEqual(await rt.run(session.id, "carryFindings", { narrativeId: n3.id }), { carried: 4, outdated: 1 });
  const epoch3 = store.listArtifacts(session.id, "FindingCarry").filter((item) => (item.data as FindingCarryData).toDiff === d3.id);
  assert.deepEqual(epoch3.map((item) => (item.data as FindingCarryData).hunkId), ["f0h0", null, "f0h0", "f0h0"]);
  assert.deepEqual((epoch3[0].data as FindingCarryData).lines, { path: "a.cpp", side: "new", start: 12, end: 12 });
});

test("a finding without an epoch two carry is not carried into epoch three", async () => {
  const { store, rt, session, put } = setup();
  const d1 = put("Diff", diff("needle", 2));
  const n1 = put("PatchNarrative", narrativeData(d1.id));
  store.putLink({ sessionId: session.id, from: n1.id, to: d1.id, kind: "derivedFrom" });
  const finding = put<ReviewFindingData>("ReviewFinding", { anchor: `${d1.id}#f0h0`, quote: "needle", lines: { path: "a.cpp", side: "new", start: 2, end: 2 }, category: "style", severity: "low", title: "f", body: "b" }, "proposed");
  store.putLink({ sessionId: session.id, from: finding.id, to: n1.id, kind: "derivedFrom" });
  store.putLink({ sessionId: session.id, from: finding.id, to: `${d1.id}#f0h0`, kind: "about" });
  const d2 = put("Diff", diff("changed", 8));
  const n2 = put("PatchNarrative", narrativeData(d2.id));
  store.putLink({ sessionId: session.id, from: n2.id, to: d2.id, kind: "derivedFrom" });
  const d3 = put("Diff", diff("needle", 12));
  const n3 = put("PatchNarrative", narrativeData(d3.id));
  store.putLink({ sessionId: session.id, from: n3.id, to: d3.id, kind: "derivedFrom" });
  assert.deepEqual(await rt.run(session.id, "carryFindings", { narrativeId: n3.id }), { carried: 0, outdated: 0 });
  assert.equal(store.listArtifacts(session.id, "FindingCarry").length, 0);
});

test("carryFindings returns zero for epoch one", async () => {
  const { store, rt, session, put } = setup();
  const d1 = put("Diff", diff("needle", 2));
  const n1 = put("PatchNarrative", narrativeData(d1.id));
  store.putLink({ sessionId: session.id, from: n1.id, to: d1.id, kind: "derivedFrom" });
  assert.deepEqual(await rt.run(session.id, "carryFindings", { narrativeId: n1.id }), { carried: 0, outdated: 0 });
});
