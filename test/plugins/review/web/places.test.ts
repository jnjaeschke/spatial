import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, DiagramData, DiffData, PatchNarrativeData } from "../../../../src/shared/types.ts";
import type { Graph, GraphNode } from "../../../../src/web/graph.ts";
import { guideEntries, narrativeGraph, reviewPlaces } from "../../../../src/plugins/review/web/graph.ts";

const hunk = (id: string) => ({ id, header: "@@ -1 +1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "ctx" as const, text: "l" }] });
const diff = (commits: number): Artifact<DiffData> => ({
  id: "D", sessionId: "S", type: "Diff", status: "verified", createdAt: "1", provenance: { taskId: "t" }, epoch: null,
  data: { baseSha: "b", headSha: "h", commits: Array.from({ length: commits }, (_, i) => ({ sha: `${i + 1}`, subject: `Part ${i + 1}`, body: "" })), files: [
    { path: "a.cpp", status: "modified", binary: false, hunks: [{ ...hunk("h0"), lines: [{ kind: "add", text: "one", commit: 0 }] }, { ...hunk("h1"), lines: [{ kind: "add", text: "two", commit: commits - 1 }] }] },
    { path: "b.h", status: "modified", binary: false, hunks: [{ ...hunk("h2"), lines: [{ kind: "add", text: "three", commit: 0 }] }] },
  ] },
});
const ch = (id: string, hunkIds: string[], dependsOn: string[] = [], title = id) => ({ id, title, explanation: "e", rationale: "r", hunkIds, dependsOn, specUrls: [] });
const narrative = (changes: PatchNarrativeData["changes"], commitIntents?: string[]): Artifact<PatchNarrativeData> => ({
  id: "N", sessionId: "S", type: "PatchNarrative", status: "proposed", createdAt: "2", provenance: { taskId: "t" }, epoch: null,
  data: { diffId: "D", summary: "sum", ...(commitIntents ? { commitIntents } : {}), changes },
});
const satellite = (id: string, anchors: string[]): GraphNode => ({ id, anchors, data: { kind: "note", body: id } });
const diagramNode = (id: string, commitIndex: number): GraphNode => ({ id, data: { kind: "diagram", diagram: { id, sessionId: "S", type: "Diagram", status: "proposed", createdAt: id, provenance: { taskId: "t" }, epoch: null, data: { kind: "sequence", commit: "x", commitIndex, title: id, summary: "", lanes: [], steps: [], before: null } } as Artifact<DiagramData> } });

const single = (): Graph => {
  const g = narrativeGraph(narrative([ch("c1", ["h0"]), ch("c2", ["h1", "h2"], ["c1"])]), diff(1), [diff(1)]);
  g.nodes.push(satellite("S1", ["N#c1"]), satellite("S2", ["S1"]));
  g.edges.push({ id: "S1->c1", source: "S1", target: "N#c1" }, { id: "S2->S1", source: "S2", target: "S1" });
  return g;
};
const stack = (): Graph => {
  const g = narrativeGraph(narrative([ch("c1", ["h0"]), ch("c2", ["h2"], ["c1"]), ch("c3", ["h1"], ["c1"])], ["first", "second"]), diff(2), [diff(2)]);
  g.nodes.push(satellite("S1", ["N#c3"]), satellite("SC", ["N#commit-1"]), satellite("SS", ["N"]), diagramNode("DG0", 0), diagramNode("DG1", 1));
  return g;
};
const ids = (g: Graph | null) => g?.nodes.map((n) => n.id);

test("initial place is the stack for stacks and the first patch otherwise", () => {
  assert.equal(reviewPlaces.initial(stack()), "stack");
  assert.equal(reviewPlaces.initial(single()), "patch:0");
});

test("stack place holds summary, commit cards, diagrams and what hangs off them", () => {
  const g = reviewPlaces.graph(stack(), "stack")!;
  assert.deepEqual(ids(g)!.sort(), ["DG0", "DG1", "N", "N#commit-0", "N#commit-1", "SC", "SS"]);
  assert.ok(g.edges.every((e) => ids(g)!.includes(e.source) && ids(g)!.includes(e.target)));
  assert.equal(reviewPlaces.graph(single(), "stack"), null);
});

test("patch place of a stack holds one commit, its changes, diagram and satellites", () => {
  const g = reviewPlaces.graph(stack(), "patch:1")!;
  assert.deepEqual(ids(g)!.sort(), ["DG1", "N#c3", "N#commit-1", "S1", "SC"]);
  assert.deepEqual(g.edges.map((e) => [e.source, e.target]), [["N#commit-1", "N#c3"]]);
  assert.deepEqual(ids(reviewPlaces.graph(stack(), "patch:0")!)!.sort(), ["DG0", "N#c1", "N#c2", "N#commit-0"]);
  assert.equal(reviewPlaces.graph(stack(), "patch:2"), null);
});

test("patch:0 of a single-commit diff is the whole graph", () => {
  const g = single();
  assert.equal(reviewPlaces.graph(g, "patch:0"), g);
  assert.equal(reviewPlaces.graph(g, "patch:1"), null);
});

test("change place holds the change and the satellites anchored to it, transitively", () => {
  assert.deepEqual(ids(reviewPlaces.graph(single(), "change:N#c1"))!.sort(), ["N#c1", "S1", "S2"]);
  assert.deepEqual(ids(reviewPlaces.graph(single(), "change:N#c2")), ["N#c2"]);
  assert.equal(reviewPlaces.graph(single(), "change:N#missing"), null);
  assert.equal(reviewPlaces.graph(single(), "change:N"), null);
  assert.equal(reviewPlaces.graph(single(), "bogus"), null);
});

test("places choose the node representation", () => {
  assert.deepEqual(["stack", "patch:3", "change:N#c1"].map(reviewPlaces.level), ["concept", "concept", "code"]);
});

test("open drills commit cards into patches and changes into change places", () => {
  assert.equal(reviewPlaces.open(stack(), "stack", "N#commit-1"), "patch:1");
  assert.equal(reviewPlaces.open(stack(), "stack", "N"), null);
  assert.equal(reviewPlaces.open(stack(), "patch:0", "N#c2"), "change:N#c2");
  assert.equal(reviewPlaces.open(stack(), "patch:0", "N#commit-0"), null);
  assert.equal(reviewPlaces.open(single(), "patch:0", "N#c1"), "change:N#c1");
  assert.equal(reviewPlaces.open(single(), "patch:0", "S1"), null);
  assert.equal(reviewPlaces.open(single(), "change:N#c1", "N#c1"), null);
});

test("up leads from a change to its patch and from a patch to the stack", () => {
  assert.deepEqual(reviewPlaces.up(stack(), "change:N#c3"), { place: "patch:1", nodeId: "N#c3" });
  assert.deepEqual(reviewPlaces.up(stack(), "patch:1"), { place: "stack", nodeId: "N#commit-1" });
  assert.equal(reviewPlaces.up(stack(), "stack"), null);
  assert.deepEqual(reviewPlaces.up(single(), "change:N#c2"), { place: "patch:0", nodeId: "N#c2" });
  assert.equal(reviewPlaces.up(single(), "patch:0"), null);
});

test("crumbs run from the top place to the current one", () => {
  assert.deepEqual(reviewPlaces.crumbs(stack(), "change:N#c3"), [{ place: "stack", label: "Stack" }, { place: "patch:1", label: "C2" }, { place: "change:N#c3", label: "c3" }]);
  assert.deepEqual(reviewPlaces.crumbs(stack(), "stack"), [{ place: "stack", label: "Stack" }]);
  assert.deepEqual(reviewPlaces.crumbs(single(), "change:N#c1"), [{ place: "patch:0", label: "Patch" }, { place: "change:N#c1", label: "c1" }]);
  const long = narrativeGraph(narrative([ch("c1", ["h0"], [], "x".repeat(60))]), diff(1), [diff(1)]);
  const label = reviewPlaces.crumbs(long, "change:N#c1").at(-1)!.label;
  assert.equal(label.length, 40);
  assert.ok(label.startsWith("xxx"));
});

test("guide steps follow the place", () => {
  const g = stack();
  assert.deepEqual(guideEntries(g, "stack").map((s) => [s.title, s.tag, s.nodeId, s.place, s.change === undefined]), [["first", "C1", "N#commit-0", undefined, true], ["second", "C2", "N#commit-1", undefined, true]]);
  assert.deepEqual(guideEntries(g, "patch:0").map((s) => [s.title, s.nodeId, s.place]), [["c1", "N#c1", undefined], ["c2", "N#c2", undefined]]);
  assert.deepEqual(guideEntries(g, "change:N#c2").map((s) => [s.nodeId, s.place]), [["N#c1", "change:N#c1"], ["N#c2", "change:N#c2"], ["N#c3", "change:N#c3"]]);
  assert.deepEqual(guideEntries(single(), "patch:0").map((s) => [s.title, s.tag]), [["c1", undefined], ["c2", undefined]]);
  assert.deepEqual(guideEntries(single(), null), []);
});

test("a commit step is reviewed once all its changes are", () => {
  const g = stack();
  for (const n of g.nodes) if (n.data.kind === "commit" && n.data.index === 0) n.data.reviewedCount = n.data.changeCount;
  assert.deepEqual(guideEntries(g, "stack").map((s) => s.reviewed), [true, false]);
});
