import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, DiffData, PatchNarrativeData, SessionState, WorkflowStartData } from "../../src/shared/types.ts";
import { closeGraph, conversationGraph, diagramSize, diagramsByMessage, estimateSize, fitMinZoom, isCoreKind, placeSatellites, rootGraph, sessionGraph as buildSessionGraph, subgraph, visibleGraph, type ConversationNodeData, type Graph, type GraphNode } from "../../src/web/graph.ts";
import type { Draft } from "../../src/web/chat-context.ts";
import type { FreePosition } from "../../src/web/free-positions.ts";

const sessionGraph = (st: SessionState, drafts?: Draft[], freePositions?: Record<string, FreePosition>) => buildSessionGraph(conversationGraph, st, drafts, freePositions);

const hunk = (id: string, n = 3) => ({
  id, header: "@@ -1 +1 @@", oldStart: 1, oldLines: n, newStart: 1, newLines: n,
  lines: Array.from({ length: n }, (_, i) => ({ kind: "ctx" as const, text: `l${i}` })),
});
const diff: Artifact<DiffData> = {
  id: "D", sessionId: "S", type: "Diff", status: "verified", createdAt: "1", provenance: { taskId: "t" },
  data: { baseSha: "b", headSha: "h", commits: [{ sha: "1", subject: "Bug 1", body: "Differential Revision: https://phab.example.com/D1" }], files: [
    { path: "a.cpp", status: "modified", binary: false, hunks: [hunk("f0h0"), hunk("f0h1", 40)] },
    { path: "b.h", status: "modified", binary: false, hunks: [hunk("f1h0")] },
  ] },
 epoch: null};
const ch = (id: string, hunkIds: string[], dependsOn: string[] = []) => ({ id, title: id, explanation: "e", rationale: "r", hunkIds, dependsOn, specUrls: [] });
const narrative = (id: string): Artifact<PatchNarrativeData> => ({
  id, sessionId: "S", type: "PatchNarrative", status: "proposed", createdAt: "2", provenance: { taskId: "t" },
  data: { diffId: "D", summary: "sum", changes: [ch("c1", ["f0h0"]), ch("c2", ["f0h1", "f1h0"], ["c1"]), ch("c3", [], ["c1"])] },
 epoch: null,});
const state = (artifacts: Artifact[], workflow: "review" | "chat" | null = "review"): SessionState => ({
  session: { id: "S", worktree: "/r", repoDir: "/r/.git", title: "t", createdAt: "0", workflow }, artifacts,
  links: artifacts.filter((a) => a.type === "ReviewFinding").map((a) => ({ id: `derived-${a.id}`, sessionId: "S", from: a.id, to: artifacts.filter((item) => item.type === "PatchNarrative").at(-1)?.id ?? "", kind: "derivedFrom" as const })),
  tasks: [], lastEventId: 0, textLinks: [], searchfox: null,
 epochs: [],});

test("sessionGraph requires a selected workflow and a chat start", () => {
  const reviewArtifacts = [diff, narrative("N")];
  assert.equal(sessionGraph(state(reviewArtifacts, null)), null);
  assert.equal(sessionGraph(state([], "chat")), null);
  const start: Artifact<WorkflowStartData> = { id: "W", sessionId: "S", type: "WorkflowStart", data: { via: "selector", workflow: "chat", params: {}, title: "Explain X", prompt: "Explain X" }, status: "proposed", createdAt: "0", provenance: { taskId: "t" } , epoch: null};
  const graph = sessionGraph(state([start], "chat"));
  assert.equal(graph?.nodes[0]?.id, "W");
  assert.equal(graph?.nodes[0]?.data.kind, "conversation");
  if (graph?.nodes[0]?.data.kind === "conversation") assert.equal(graph.nodes[0].data.prompt, "Explain X");
});

test("aside threads at the workflow start are chat nodes and use saved free positions", () => {
  const start = { id: "W", sessionId: "S", type: "WorkflowStart", status: "proposed", createdAt: "0", provenance: { taskId: "t" }, data: { via: "selector", workflow: "chat", params: {}, title: "Chat", prompt: "Explain" } , epoch: null} as Artifact<WorkflowStartData>;
  const aside = { id: "TA", sessionId: "S", type: "ChatThread", status: "verified", createdAt: "1", provenance: { taskId: "turn" }, data: { anchor: "W", aside: true } , epoch: null} as Artifact;
  const fallback = sessionGraph(state([start, aside], "chat"))!;
  const node = fallback.nodes.find((item) => item.id === "TA")!;
  assert.equal(node.data.kind, "chat");
  assert.deepEqual(node.anchors, ["W"]);
  assert.equal(node.position, undefined);
  const placed = sessionGraph(state([start, aside], "chat"), [], { TA: { x: 123, y: 456 } })!;
  assert.deepEqual(placed.nodes.find((item) => item.id === "TA")?.position, { x: 123, y: 456 });
});

test("fitMinZoom keeps enlarged text readable", () => {
  assert.deepEqual(fitMinZoom(1), {});
  assert.deepEqual(fitMinZoom(0.9), {});
  assert.deepEqual(fitMinZoom(1.15), { minZoom: 1.035 });
  assert.deepEqual(fitMinZoom(1.6), { minZoom: 1.44 });
});

test("placeSatellites: column right of the story, aligned to anchors, no overlap", () => {
  const main = new Map([
    ["a", { x: 0, y: 0, width: 400, height: 100 }],
    ["b", { x: 500, y: 300, width: 400, height: 100 }],
  ]);
  const pos = placeSatellites(main, [
    { id: "s1", width: 300, height: 250, anchors: ["a"] },
    { id: "s2", width: 300, height: 100, anchors: ["a"] },
    { id: "s3", width: 300, height: 100, anchors: ["b"] },
  ]);
  for (const p of pos.values()) assert.ok(p.x >= 900 + 80);
  assert.equal(pos.get("s1")!.y, 0);
  assert.ok(pos.get("s2")!.y >= 250 + 24);
  assert.ok(pos.get("s3")!.y >= pos.get("s2")!.y + 100 + 24);
});

test("placeSatellites uses columns to the right of placed anchors and preserves column one", () => {
  const main = new Map([
    ["N", { x: 0, y: 0, width: 400, height: 100 }],
    ["N#c1", { x: 0, y: 180, width: 400, height: 100 }],
  ]);
  const pos = placeSatellites(main, [
    { id: "first", width: 300, height: 100, anchors: ["N#c1"] },
    { id: "second", width: 300, height: 100, anchors: ["N"] },
    { id: "nested", width: 300, height: 100, anchors: ["first"] },
    { id: "missing", width: 300, height: 100, anchors: ["missing"] },
  ]);
  assert.equal(pos.get("first")?.x, 480);
  assert.equal(pos.get("second")?.x, 480);
  assert.equal(pos.get("nested")?.x, 860);
  assert.ok(!pos.has("missing"));
  assert.equal(pos.get("first")?.y, 180);
  assert.equal(pos.get("second")?.y, 0);
});

test("visibleGraph hides only collapsed quoted threads and their edges", () => {
  const node = (id: string, data: GraphNode["data"]): GraphNode => ({ id, data });
  const nodes: GraphNode[] = [
    node("quoted", { kind: "chat", foldsToQuote: true, anchor: "N#c1", quote: "quote", diffId: "D", hunks: [], threadId: "quoted", draftId: null, taskId: null, messages: [], revisions: {}, mcpRequests: [] }),
    node("plain", { kind: "chat", foldsToQuote: true, anchor: "N#c1", diffId: "D", hunks: [], threadId: "plain", draftId: null, taskId: null, messages: [], revisions: {}, mcpRequests: [] }),
    node("draft", { kind: "chat", anchor: "N#c1", quote: "draft quote", diffId: "D", hunks: [], threadId: null, draftId: "draft", taskId: null, messages: [], revisions: {}, mcpRequests: [] }),
    node("N#c1", { kind: "change", narrativeId: "N", diffId: "D", change: ch("c1", []), hunks: [], files: [], commit: null, reviewed: false, threads: [] }),
  ];
  const edges = [
    { id: "quoted-edge", source: "quoted", target: "N#c1" },
    { id: "plain-edge", source: "plain", target: "N#c1" },
    { id: "draft-edge", source: "draft", target: "N#c1" },
  ];
  const visible = visibleGraph({ nodes, edges }, new Set(["quoted", "plain", "draft", "N#c1"]));
  assert.deepEqual(visible.nodes.map((n) => n.id), ["plain", "draft", "N#c1"]);
  assert.deepEqual(visible.edges.map((e) => e.id), ["plain-edge", "draft-edge"]);
});

test("sessionGraph shows draft notes as free positioned nodes", () => {
  const start = { id: "W", sessionId: "S", type: "WorkflowStart", status: "proposed", createdAt: "0", provenance: { taskId: "t" }, data: { via: "selector", workflow: "chat", params: {}, title: "Chat", prompt: "Explain" } , epoch: null} as Artifact<WorkflowStartData>;
  const note = { id: "N1", sessionId: "S", type: "Note", status: "verified", createdAt: "1", provenance: { taskId: "user" }, data: { body: "Check lifetime" } , epoch: null} as Artifact;
  const graph = sessionGraph(state([start, note], "chat"), [], { N1: { x: 90, y: 120 } })!;
  const node = graph.nodes.find((item) => item.id === "N1")!;
  assert.equal(node.data.kind, "note");
  assert.deepEqual(node.position, { x: 90, y: 120 });
});

test("estimateSize scales core node dimensions", () => {
  const chat = { kind: "chat" as const, anchor: "W", diffId: "", hunks: [], threadId: "T", draftId: null, taskId: null, messages: [], revisions: {}, mcpRequests: [] };
  const base = estimateSize(chat);
  assert.deepEqual(estimateSize(chat, 1.5), { width: base.width * 1.5, height: base.height * 1.5 });
});


const rgArtifact = (id: string, type: string, data: unknown) => ({ id, sessionId: "s", type, status: "verified", data, provenance: { taskId: "user" }, epoch: 1, createdAt: "" });
const rgState = (artifacts: ReturnType<typeof rgArtifact>[], links: { id: string; sessionId: string; from: string; to: string; kind: string }[] = []) => ({
  session: { id: "s", workflow: "chat", title: "T", worktree: "/r", repoDir: "/r/.git", createdAt: "" }, artifacts, links, tasks: [], epochs: [], lastEventId: 0,
}) as unknown as SessionState;
const start = rgArtifact("START", "WorkflowStart", { via: "command", workflow: "chat", params: {}, title: "T", prompt: "hi" });

test("rootGraph adds no conversation node: the plugin's first node is the root, and the root thread is no chat", () => {
  const rootThread = rgArtifact("T0", "ChatThread", { anchor: "START" });
  const g = rootGraph(rgState([start, rootThread]), [], { nodes: [{ id: "A", data: { kind: "x" } }, { id: "B", data: { kind: "x" } }], edges: [{ id: "A->B", source: "A", target: "B" }] });
  assert.deepEqual(g.nodes.map((n) => n.id), ["A", "B"]);
  assert.deepEqual(g.edges.map((e) => e.id), ["A->B"]);
  assert.deepEqual(rootGraph(rgState([start]), [], { nodes: [], edges: [] }), { nodes: [], edges: [] });
});

test("notes and asides on the workflow start anchor on the root node; without nodes they are dropped", () => {
  const note = rgArtifact("N1", "Note", { body: "b" });
  const aside = rgArtifact("TA", "ChatThread", { anchor: "START", aside: true });
  const g = rootGraph(rgState([start, note, aside]), [], { nodes: [{ id: "A", data: { kind: "x" } }], edges: [] });
  assert.deepEqual(g.nodes.filter((n) => n.anchors).map((n) => [n.id, n.anchors]), [["N1", ["A"]], ["TA", ["A"]]]);
  assert.deepEqual(g.edges.map((e) => e.id).sort(), ["N1->A", "TA->A"]);
  assert.deepEqual(rootGraph(rgState([start, note, aside]), [], { nodes: [], edges: [] }).nodes, []);
});

test("conversationGraph is the conversation node hosting the root thread", () => {
  const thread = rgArtifact("T0", "ChatThread", { anchor: "START" });
  const g = conversationGraph(rgState([start, thread]), [])!;
  assert.deepEqual(g.nodes.map((n) => [n.id, n.data.kind]), [["START", "conversation"]]);
  assert.equal((g.nodes[0]!.data as ConversationNodeData).threadId, "T0");
  assert.equal(conversationGraph(rgState([]), []), null);
});

test("rootGraph resolves chat anchors to nodes, sub-refs and hosts; the replied message only without resolveSub", () => {
  const thread = (id: string, anchor: string) => rgArtifact(id, "ChatThread", { anchor });
  const state = rgState([start, thread("T1", "A#sub"), thread("T2", "M1"), thread("T3", "HOSTED")], [{ id: "l", sessionId: "s", from: "M1", to: "T1", kind: "reply" }]);
  const nodes = [{ id: "A", data: { kind: "x" } }, { id: "H", data: { kind: "x", threads: [] } }];
  const g = rootGraph(state, [], { nodes, edges: [], hosts: new Map([["HOSTED", "H"]]), resolveSub: (anchor) => anchor.startsWith("A#") ? "A" : null });
  assert.deepEqual(g.nodes.filter((n) => n.data.kind === "chat").map((n) => [n.id, n.anchors]), [["T1", ["A"]]]);
  assert.deepEqual(rootGraph(state, [], { nodes: [...nodes, { id: "T1", data: { kind: "x" } }], edges: [] }).nodes.filter((n) => n.data.kind === "chat").map((n) => [n.id, n.anchors]), [["T2", ["T1"]]]);
  assert.deepEqual(((g.nodes.find((n) => n.id === "H")!.data as unknown as { threads: { threadId: string }[] }).threads).map((t) => t.threadId), ["T3"]);
});

test("subgraph keeps the nodes anchored, transitively, on kept nodes", () => {
  const g = { nodes: [{ id: "A", data: { kind: "x" } }, { id: "B", anchors: ["A"], data: { kind: "x" } }, { id: "C", anchors: ["B"], data: { kind: "x" } }, { id: "D", data: { kind: "x" } }], edges: [{ id: "e1", source: "B", target: "A" }, { id: "e2", source: "D", target: "A" }] };
  assert.deepEqual(subgraph(g, new Set(["A"])), { nodes: g.nodes.slice(0, 3), edges: [g.edges[0]] });
});

test("diagramsByMessage maps the graph's diagram nodes to the messages they were derived from", () => {
  const g = { nodes: [{ id: "D1", data: { kind: "diagram" } }, { id: "X", data: { kind: "x" } }], edges: [] };
  const links = [{ id: "1", sessionId: "s", from: "D1", to: "M", kind: "derivedFrom" }, { id: "2", sessionId: "s", from: "X", to: "M", kind: "derivedFrom" }];
  assert.deepEqual(diagramsByMessage(g, rgState([], links)), { M: ["D1"] });
  assert.equal(diagramsByMessage({ nodes: [], edges: [] }, rgState([], links)), undefined);
});

test("diagram nodes are a core kind sized by lanes and steps", () => {
  const data = { kind: "diagram" as const, diagram: { data: { lanes: [{}, {}, {}, {}], steps: [{}, {}] } } } as never;
  assert.equal(isCoreKind(data, "diagram"), true);
  assert.deepEqual(diagramSize(data), { width: 760, height: 370 });
});

test("a closed node with reopenOn is offered on its host; movable nodes take their free position", () => {
  const g = { nodes: [{ id: "H", data: { kind: "x" } }, { id: "B", data: { kind: "x", closable: true, reopenOn: "H" } }], edges: [{ id: "e", source: "H", target: "B" }] };
  const { graph, closedOn } = closeGraph(g, new Set(["B"]));
  assert.deepEqual(graph.nodes.map((n) => n.id), ["H"]);
  assert.deepEqual(closedOn.get("H"), [{ id: "B", kind: "box" }]);
  const state = { session: { workflow: "x" }, artifacts: [], links: [] } as unknown as SessionState;
  const placed = buildSessionGraph(() => ({ nodes: [{ id: "M", data: { kind: "x", movable: true } }, { id: "N", data: { kind: "x" } }], edges: [] }), state, [], { M: { x: 1, y: 2 }, N: { x: 3, y: 4 } })!;
  assert.deepEqual(placed.nodes.map((n) => n.position), [{ x: 1, y: 2 }, undefined]);
});

test("the root conversation says whether an epoch of the session is running", () => {
  const running = { ...rgState([start]), epochs: [{ sessionId: "s", n: 1, phase: "implement", status: "running", input: null, error: null, startedAt: "", endedAt: null }] } as unknown as SessionState;
  const data = (st: SessionState) => conversationGraph(st, [])!.nodes[0]!.data as ConversationNodeData;
  assert.equal(data(running).epochRunning, true);
  assert.equal(data(rgState([start])).epochRunning, false);
});
