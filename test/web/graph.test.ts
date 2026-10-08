import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, DiffData, PatchNarrativeData, SessionState, WorkflowStartData } from "../../src/shared/types.ts";
import { conversationGraph, estimateSize, fitMinZoom, placeSatellites, sessionGraph as buildSessionGraph, visibleGraph, zoomLevel, type GraphNode } from "../../src/web/graph.ts";
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
  tasks: [], lastEventId: 0, searchfox: null,
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

test("zoomLevel switches up at the entry thresholds", () => {
  assert.equal(zoomLevel(0.6, "patch"), "concept");
  assert.equal(zoomLevel(1.2, "concept"), "code");
});

test("zoomLevel switches down below the exit thresholds", () => {
  assert.equal(zoomLevel(0.9, "code"), "code");
  assert.equal(zoomLevel(0.899, "code"), "concept");
  assert.equal(zoomLevel(0.45, "concept"), "concept");
  assert.equal(zoomLevel(0.449, "concept"), "patch");
});

test("zoomLevel stays in the hysteresis band", () => {
  assert.equal(zoomLevel(0.5, "patch"), "patch");
  assert.equal(zoomLevel(0.5, "concept"), "concept");
  assert.equal(zoomLevel(1, "concept"), "concept");
  assert.equal(zoomLevel(1, "code"), "code");
});

test("zoomLevel handles jumps across multiple levels", () => {
  assert.equal(zoomLevel(1.5, "patch"), "code");
  assert.equal(zoomLevel(0.3, "code"), "patch");
});

test("fitMinZoom preserves readable text and expanded stack changes", () => {
  assert.deepEqual(fitMinZoom(1, "code"), {});
  assert.deepEqual(fitMinZoom(0.9, "code"), {});
  assert.deepEqual(fitMinZoom(1.15, "code"), { minZoom: 1.035 });
  assert.deepEqual(fitMinZoom(1.6, "patch"), {});
  assert.deepEqual(fitMinZoom(1.6, "concept"), {});
  assert.deepEqual(fitMinZoom(1.6, "code"), { minZoom: 1.44 });
  assert.equal(zoomLevel(fitMinZoom(1.6, "code").minZoom!, "code"), "code");
  assert.deepEqual(fitMinZoom(1, "code", true), { minZoom: 0.6 });
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

test("placeSatellites aligns quoted chats to their quote and stacks by effective y", () => {
  const main = new Map([["a", { x: 0, y: 0, width: 400, height: 600 }]]);
  const single = placeSatellites(main, [{ id: "s", width: 300, height: 150, anchors: ["a"], dy: 300 }]);
  assert.equal(single.get("s")?.y, 300);

  const ordered = placeSatellites(main, [
    { id: "later", width: 300, height: 150, anchors: ["a"], dy: 300 },
    { id: "earlier", width: 300, height: 150, anchors: ["a"], dy: 100 },
  ]);
  assert.equal(ordered.get("earlier")?.y, 100);
  assert.equal(ordered.get("later")?.y, 300);

  const stacked = placeSatellites(main, [
    { id: "later", width: 300, height: 250, anchors: ["a"], dy: 300 },
    { id: "earlier", width: 300, height: 250, anchors: ["a"], dy: 100 },
  ]);
  assert.equal(stacked.get("earlier")?.y, 100);
  assert.equal(stacked.get("later")?.y, 100 + 250 + 24);
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
  const base = estimateSize(chat, "code");
  assert.deepEqual(estimateSize(chat, "code", 1.5), { width: base.width * 1.5, height: base.height * 1.5 });
});
