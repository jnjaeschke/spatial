import { test } from "node:test";
import assert from "node:assert/strict";
import { explorerGraph, explorerLayout, openBoxes, specNodeId, type AlgorithmNodeData } from "../../../../src/plugins/spec/web/graph.ts";
import { closeGraph } from "../../../../src/web/graph.ts";
import type { Artifact, SessionState } from "../../../../src/shared/types.ts";
import type { SpecAlgorithmData, SpecOpenedData } from "../../../../src/plugins/spec/shared/types.ts";

const link = (anchor: string, from: string | null = null, step = "1"): SpecOpenedData => ({ anchor, from: from === null ? null : { anchor: from, step } });

test("closing keeps a box that a box staying open still links", () => {
  const opened = [link("R"), link("A", "R"), link("B", "R"), link("C", "A"), link("C", "B")];
  assert.deepEqual(openBoxes(opened, new Set(["A"])), { open: ["R", "B", "C"], closedHosts: new Map([["A", "R"]]) });
});

test("closing a box closes the subtree only it reaches", () => {
  const opened = [link("R"), link("A", "R"), link("D", "A"), link("E", "D"), link("F", "R")];
  assert.deepEqual(openBoxes(opened, new Set(["A"])).open, ["R", "F"]);
});

test("cycles terminate, and a closed root closes everything only it reaches", () => {
  const opened = [link("R"), link("A", "R"), link("B", "A"), link("A", "B")];
  assert.deepEqual(openBoxes(opened, new Set()).open, ["R", "A", "B"]);
  assert.deepEqual(openBoxes(opened, new Set(["A"])).open, ["R"]);
  assert.deepEqual(openBoxes(opened, new Set(["R"])), { open: [], closedHosts: new Map([["R", null]]) });
});

let n = 0;
const artifact = <T>(type: string, data: T) => ({ id: `a${++n}`, sessionId: "s", type, status: "verified", data, provenance: { taskId: "user" }, epoch: 1, createdAt: "" }) as Artifact<T>;
const algorithm = (ref: string) => artifact<SpecAlgorithmData>("SpecAlgorithm", { ref, spec: ref.split("#")[0]!, anchor: ref.split("#")[1]!, title: ref, type: "algorithm", url: `https://x/#${ref}`, content: "1. Step.", sha: "s1", outgoingRefs: 0, effects: [], effectsStatus: { state: "ready", semantics: "may", issues: [], omitted: 0 }, stepEffects: {} });
const start = artifact("WorkflowStart", { via: "command", workflow: "explore", params: { query: "HTML#a" }, title: "t", prompt: "HTML#a" });
const state = (artifacts: Artifact[]) => ({ session: { id: "s", workflow: "explore", title: "Explore", worktree: "/r", repoDir: "/r/.git", createdAt: "" }, artifacts: [start, ...artifacts], links: [], tasks: [], epochs: [], lastEventId: 0 }) as unknown as SessionState;

test("explorerGraph: root edges, step-labelled link edges, a closed box offered on its host, trace hops", () => {
  const artifacts: Artifact[] = [...["HTML#a", "HTML#b", "HTML#c"].map(algorithm), ...[
    artifact("SpecOpened", link("HTML#a")), artifact("SpecOpened", link("HTML#b", "HTML#a", "2")), artifact("SpecOpened", link("HTML#c", "HTML#a", "3")), artifact("SpecOpened", link("HTML#c", "HTML#b", "1")),
  ]];
  const s = state(artifacts);
  const trace = { traceId: "t", title: "T", entries: [{ anchor: "HTML#a", step: "2", note: "" }, { anchor: "HTML#a", step: "3", note: "" }, { anchor: "HTML#c", step: "1", note: "" }] };
  const g = explorerGraph(s, [], new Set([specNodeId("HTML#b")]), trace)!;
  assert.deepEqual(g.nodes.map((node) => node.id), [start.id, "spec:HTML#a", "spec:HTML#c", "spec:HTML#b"]);
  const b = g.nodes.find((node) => node.id === "spec:HTML#b")!.data as AlgorithmNodeData;
  assert.deepEqual([b.parent, b.reopenOn, b.order], ["spec:HTML#a", "spec:HTML#a", 2]);
  assert.deepEqual(g.edges.map((e) => [e.id, e.label]), [
    [`${start.id}->spec:HTML#a`, undefined], ["spec:HTML#a->spec:HTML#b@2", "step 2"], ["spec:HTML#a->spec:HTML#c@3", "step 3"], ["spec:HTML#b->spec:HTML#c@1", "step 1"], ["hop:1", "2"],
  ]);
  const { graph, closedOn } = closeGraph(g, new Set(["spec:HTML#b"]));
  assert.ok(!graph.nodes.some((node) => node.id === "spec:HTML#b"));
  assert.deepEqual(closedOn.get("spec:HTML#a"), [{ id: "spec:HTML#b", kind: "box" }]);
});

test("explorerLayout: root left, each box right of its parent, stacked in its column", () => {
  const box = (id: string, parent: string, order: number, height: number) => ({ id, width: 500, height, data: { kind: "spec-algorithm", parent, order } as never });
  const positions = explorerLayout([{ id: "R", width: 300, height: 200, data: { kind: "conversation" } as never }, box("A", "R", 0, 400), box("C", "A", 2, 100), box("B", "A", 1, 100), box("X", "free", 3, 50)], []);
  assert.deepEqual(Object.fromEntries(positions), { R: { x: 0, y: 0 }, A: { x: 420, y: 0 }, B: { x: 1040, y: 0 }, C: { x: 1040, y: 148 }, X: { x: 420, y: 448 } });
});

test("explorerLayout places a parent opened after its child first", () => {
  const box = (id: string, parent: string, order: number) => ({ id, width: 500, height: 100, data: { kind: "spec-algorithm", parent, order } as never });
  const positions = explorerLayout([{ id: "R", width: 300, height: 200, data: { kind: "conversation" } as never }, box("X", "D", 0), box("D", "R", 1)], []);
  assert.deepEqual(Object.fromEntries(positions), { R: { x: 0, y: 0 }, D: { x: 420, y: 0 }, X: { x: 1040, y: 0 } });
});

test("explorerGraph offers a closed root box on the conversation", () => {
  const g = explorerGraph(state([algorithm("HTML#r"), artifact("SpecOpened", link("HTML#r"))]), [], new Set([specNodeId("HTML#r")]), null)!;
  assert.equal((g.nodes.find((node) => node.id === "spec:HTML#r")!.data as AlgorithmNodeData).reopenOn, start.id);
  assert.deepEqual(closeGraph(g, new Set(["spec:HTML#r"])).closedOn.get(start.id), [{ id: "spec:HTML#r", kind: "box" }]);
});

test("explorerGraph dashes the hop into an unverified entry and titles it with the reason", () => {
  const s = state([algorithm("HTML#a"), algorithm("HTML#b"), artifact("SpecOpened", link("HTML#a")), artifact("SpecOpened", link("HTML#b", "HTML#a", "1"))] as Artifact[]);
  const trace = { traceId: "t", title: "T", entries: [{ anchor: "HTML#a", step: "1", note: "" }, { anchor: "HTML#b", step: "1", note: "" }] };
  const reason = "HTML#a step 1 does not link HTML#b";
  assert.deepEqual(explorerGraph(s, [], new Set(), trace, new Map([[1, reason]]))!.edges.find((edge) => edge.id === "hop:0"), { id: "hop:0", source: "spec:HTML#a", target: "spec:HTML#b", label: "1", className: "trace-hop unverified", title: reason });
  assert.equal(explorerGraph(s, [], new Set(), trace)!.edges.find((edge) => edge.id === "hop:0")!.className, "trace-hop");
});
