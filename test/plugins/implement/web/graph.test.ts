import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, SessionState } from "../../../../src/web/plugin-api.ts";
import { investigationGraph, investigationSize, latestInvestigation } from "../../../../src/plugins/implement/web/graph.ts";
import type { InvestigationData } from "../../../../src/plugins/implement/shared/types.ts";

let k = 0;
const art = (type: string, data: unknown): Artifact => ({ id: `${type}${++k}`, sessionId: "s", type, status: "verified", data, provenance: { taskId: "t" }, epoch: null, createdAt: "" });
const data: InvestigationData = {
  kind: "bugfix", summary: "S", bug: null, testCases: [], openQuestions: [], exploration: [],
  steps: [{ title: "T", message: "M", intent: "I", tests: [] }],
  locations: [{ path: "a.cpp", line: 3, quote: "x", why: "w" }, { path: "b.cpp", line: 9, quote: "y", why: "v" }],
};
const state = (artifacts: Artifact[], links: SessionState["links"] = [], searchfox: SessionState["searchfox"] = null): SessionState => ({
  session: { id: "s", worktree: "/r", repoDir: "/r/.git", title: "Title", createdAt: "", workflow: "implement" }, artifacts, links, tasks: [], epochs: [], lastEventId: 0, searchfox,
});
const start = () => art("WorkflowStart", { via: "command", workflow: "implement", params: { request: "r" }, title: "Title", prompt: "do it" });

test("without a start there is no graph; before the investigation only the request shows", () => {
  assert.equal(investigationGraph(state([]), []), null);
  const g = investigationGraph(state([start()]), [])!;
  assert.deepEqual(g.nodes.map((n) => n.data.kind), ["conversation"]);
});

test("the investigation is the main node with its request and locations around it", () => {
  const s = start(), inv = art("Investigation", data);
  const g = investigationGraph(state([s, inv], [], { repoBase: "https://sf/", tipRev: "abc" }), [])!;
  assert.deepEqual(g.nodes.map((n) => n.data.kind), ["investigation", "conversation", "location", "location"]);
  assert.equal(g.nodes[0]!.id, inv.id);
  assert.equal(g.nodes[0]!.anchors, undefined);
  assert.deepEqual(g.nodes[1]!.anchors, [inv.id]);
  assert.deepEqual(g.nodes[2]!.anchors, [inv.id]);
  assert.equal(g.nodes[2]!.id, `${inv.id}#loc0`);
  assert.deepEqual((g.nodes[2]!.data as unknown as { searchfox: unknown }).searchfox, { repoBase: "https://sf/", rev: "abc" });
  assert.ok(g.edges.some((e) => e.source === s.id && e.target === inv.id));
  assert.equal(latestInvestigation(state([s, inv]))?.id, inv.id);
});

test("a verified diagram of the existing code becomes a diagram node beside the card", () => {
  const s = start(), inv = art("Investigation", { ...data, diagram: { kind: "sequence", commit: "BASE", commitIndex: 0, title: "Flow", summary: "S", lanes: [], steps: [], before: null } });
  const g = investigationGraph(state([s, inv]), [])!;
  const node = g.nodes.find((n) => n.data.kind === "diagram")!;
  assert.equal(node.id, `${inv.id}#diagram`);
  assert.deepEqual(node.anchors, [inv.id]);
  assert.equal((node.data as unknown as { diagram: Artifact }).diagram.type, "Diagram");
});

test("a chat on a location or a plan step hangs on its card", () => {
  const s = start(), inv = art("Investigation", data);
  const onLoc = art("ChatThread", { anchor: `${inv.id}#loc1` }), onStep = art("ChatThread", { anchor: `${inv.id}#step0` });
  const m1 = art("ChatMessage", { role: "user", text: "q1" }), m2 = art("ChatMessage", { role: "user", text: "q2" });
  const links = [{ id: "l1", sessionId: "s", from: m1.id, to: onLoc.id, kind: "reply" as const }, { id: "l2", sessionId: "s", from: m2.id, to: onStep.id, kind: "reply" as const }];
  const g = investigationGraph(state([s, inv, onLoc, m1, onStep, m2], links), [])!;
  assert.deepEqual(g.nodes.find((n) => n.id === onLoc.id)!.anchors, [`${inv.id}#loc1`]);
  assert.deepEqual(g.nodes.find((n) => n.id === onStep.id)!.anchors, [inv.id]);
});

test("sizes grow with the content and are known for both kinds", () => {
  const small = investigationSize({ kind: "investigation", investigationId: "i", sessionId: "s", data });
  const big = investigationSize({ kind: "investigation", investigationId: "i", sessionId: "s", data: { ...data, steps: [...data.steps, ...data.steps, ...data.steps] } });
  assert.ok(big.height > small.height);
  assert.ok(investigationSize({ kind: "location", anchor: "a", location: data.locations[0]!, searchfox: null }).width > 0);
  assert.throws(() => investigationSize({ kind: "other" }), /No size/);
});
