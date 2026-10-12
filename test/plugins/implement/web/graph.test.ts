import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, SessionState } from "../../../../src/web/plugin-api.ts";
import { investigationCollapsedByDefault, investigationGraph, investigationSize, latestInvestigation } from "../../../../src/plugins/implement/web/graph.ts";
import type { InvestigationData } from "../../../../src/plugins/implement/shared/types.ts";

let k = 0;
const art = (type: string, data: unknown): Artifact => ({ id: `${type}${++k}`, sessionId: "s", type, status: "verified", data, provenance: { taskId: "t" }, epoch: null, createdAt: "" });
const data: InvestigationData = {
  kind: "bugfix", summary: "S", bug: null, testCases: [], openQuestions: [], exploration: [],
  steps: [{ title: "T", message: "M", intent: "I", checks: [] }, { title: "U", message: "N", intent: "J", checks: [] }],
  locations: [{ path: "a.cpp", line: 3, quote: "x", why: "w", step: 1 }, { path: "b.cpp", line: 9, quote: "y", why: "v", step: null }],
};
const state = (artifacts: Artifact[], links: SessionState["links"] = [], searchfox: SessionState["searchfox"] = null): SessionState => ({
  session: { id: "s", worktree: "/r", repoDir: "/r/.git", title: "Title", createdAt: "", workflow: "implement" }, artifacts, links, tasks: [], epochs: [], lastEventId: 0, searchfox,
});
const start = () => art("WorkflowStart", { via: "command", workflow: "implement", params: { request: "r" }, title: "Title", prompt: "do it" });

test("there is no graph before the investigation", () => {
  assert.equal(investigationGraph(state([]), []), null);
  assert.equal(investigationGraph(state([start()]), []), null);
});

test("locations link at the session's link revision, else at Searchfox's tip", () => {
  const s = start(), inv = art("Investigation", data);
  const rev = (linkRev: string | null) => (investigationGraph(state([s, inv], [], { repoBase: "https://sf/", tipRev: "tip", linkRev }), [])!.nodes.find((n) => n.data.kind === "location")!.data as unknown as { searchfox: { rev: string } }).searchfox.rev;
  assert.deepEqual([rev("base"), rev(null)], ["base", "tip"]);
});

test("the investigation is split into a header, a chain of step nodes and satellites", () => {
  const s = start(), inv = art("Investigation", { ...data, testCases: [{ description: "d", expected: "e" }], openQuestions: ["Q?"] });
  const g = investigationGraph(state([s, inv], [], { repoBase: "https://sf/", tipRev: "abc", linkRev: null }), [])!;
  const node = (id: string) => g.nodes.find((n) => n.id === id)!;
  assert.deepEqual(g.nodes.map((n) => n.data.kind), ["investigation", "investigation-step", "investigation-step", "location", "location", "investigation-tests", "investigation-questions"]);
  assert.equal(g.nodes[0]!.id, inv.id);
  assert.equal(g.nodes[0]!.anchors, undefined);
  assert.equal(node(`${inv.id}#step0`).anchors, undefined);
  assert.equal(node(`${inv.id}#step1`).anchors, undefined);
  assert.deepEqual(node(`${inv.id}#loc0`).anchors, [`${inv.id}#step1`]);
  assert.deepEqual(node(`${inv.id}#loc1`).anchors, [inv.id]);
  assert.deepEqual(node(`${inv.id}#tests`).anchors, [inv.id]);
  assert.deepEqual(node(`${inv.id}#questions`).anchors, [inv.id]);
  assert.deepEqual((node(`${inv.id}#loc0`).data as unknown as { searchfox: unknown }).searchfox, { repoBase: "https://sf/", rev: "abc" });
  const edges = g.edges.map((e) => `${e.source}>${e.target}`);
  for (const edge of [`${inv.id}>${inv.id}#step0`, `${inv.id}#step0>${inv.id}#step1`, `${inv.id}#loc0>${inv.id}#step1`, `${inv.id}#loc1>${inv.id}`, `${inv.id}#tests>${inv.id}`, `${inv.id}#questions>${inv.id}`]) assert.ok(edges.includes(edge), edge);
  assert.equal(latestInvestigation(state([s, inv]))?.id, inv.id);
});

test("tests and questions nodes exist only when there is something to show; the tests node starts collapsed", () => {
  const s = start(), plain = art("Investigation", data);
  assert.deepEqual(investigationGraph(state([s, plain]), [])!.nodes.filter((n) => n.id.endsWith("#tests") || n.id.endsWith("#questions")), []);
  const inv = art("Investigation", { ...data, testCases: [{ description: "d", expected: "e" }] });
  assert.deepEqual(investigationCollapsedByDefault(investigationGraph(state([s, inv]), [])!), [`${inv.id}#tests`]);
});

test("a verified diagram of the existing code becomes a diagram node beside the card", () => {
  const s = start(), inv = art("Investigation", { ...data, diagram: { kind: "sequence", commit: "BASE", commitIndex: 0, title: "Flow", summary: "S", lanes: [], steps: [], before: null } });
  const g = investigationGraph(state([s, inv]), [])!;
  const node = g.nodes.find((n) => n.data.kind === "diagram")!;
  assert.equal(node.id, `${inv.id}#diagram`);
  assert.deepEqual(node.anchors, [inv.id]);
  assert.equal((node.data as unknown as { diagram: Artifact }).diagram.type, "Diagram");
});

test("a chat on a location or a plan step hangs on that node; an unknown sub-anchor resolves to the header", () => {
  const s = start(), inv = art("Investigation", data);
  const onLoc = art("ChatThread", { anchor: `${inv.id}#loc1` }), onStep = art("ChatThread", { anchor: `${inv.id}#step1` }), onOther = art("ChatThread", { anchor: `${inv.id}#nothing` });
  const messages = [onLoc, onStep, onOther].map(() => art("ChatMessage", { role: "user", text: "q" }));
  const links = [onLoc, onStep, onOther].map((thread, i) => ({ id: `l${i}`, sessionId: "s", from: messages[i]!.id, to: thread.id, kind: "reply" as const }));
  const g = investigationGraph(state([s, inv, onLoc, onStep, onOther, ...messages], links), [])!;
  assert.deepEqual(g.nodes.find((n) => n.id === onLoc.id)!.anchors, [`${inv.id}#loc1`]);
  assert.deepEqual(g.nodes.find((n) => n.id === onStep.id)!.anchors, [`${inv.id}#step1`]);
  assert.deepEqual(g.nodes.find((n) => n.id === onOther.id)!.anchors, [inv.id]);
});

const sizeOf = (node: object) => investigationSize({ investigationId: "i", sessionId: "s", ...node } as never);

test("each node has its own size; the header does not grow with the plan", () => {
  const header = (d: InvestigationData) => sizeOf({ kind: "investigation", data: d });
  assert.equal(header({ ...data, steps: [...data.steps, ...data.steps, ...data.steps] }).height, header(data).height);
  assert.ok(header({ ...data, summary: "word ".repeat(400) }).height <= header(data).height + 3 * 22);
  const step = (checks: number) => sizeOf({ kind: "investigation-step", index: 0, step: { ...data.steps[0]!, checks: Array.from({ length: checks }, () => ({ kind: "new-test" as const, path: "t.js" })) } });
  assert.ok(step(2).height > step(0).height);
  const tests = (count: number) => sizeOf({ kind: "investigation-tests", testCases: Array.from({ length: count }, () => ({ description: "d", expected: "e" })) });
  assert.ok(tests(3).height > tests(1).height);
  const questions = (count: number) => sizeOf({ kind: "investigation-questions", questions: Array.from({ length: count }, () => "q") });
  assert.ok(questions(3).height > questions(1).height);
  assert.ok(sizeOf({ kind: "location", anchor: "a", location: data.locations[0]!, searchfox: null }).width > 0);
  assert.throws(() => investigationSize({ kind: "other" }), /No size/);
});
