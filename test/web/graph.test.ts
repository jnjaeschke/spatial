import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, DiffData, PatchNarrativeData, ReviewFindingData, SessionState } from "../../src/shared/types.ts";
import { anchorNodeId, estimateSize, latestNarrative, layout, narrativeGraph, placeSatellites, sessionGraph, visibleGraph, zoomLevel, SATELLITE_WIDTH, type GraphNode } from "../../src/web/graph.ts";

const hunk = (id: string, n = 3) => ({
  id, header: "@@ -1 +1 @@", oldStart: 1, oldLines: n, newStart: 1, newLines: n,
  lines: Array.from({ length: n }, (_, i) => ({ kind: "ctx" as const, text: `l${i}` })),
});
const diff: Artifact<DiffData> = {
  id: "D", sessionId: "S", type: "Diff", status: "verified", createdAt: "1", provenance: { taskId: "t" },
  data: { baseSha: "b", headSha: "h", commits: [{ sha: "1", subject: "Bug 1", body: "" }], files: [
    { path: "a.cpp", status: "modified", binary: false, hunks: [hunk("f0h0"), hunk("f0h1", 40)] },
    { path: "b.h", status: "modified", binary: false, hunks: [hunk("f1h0")] },
  ] },
};
const ch = (id: string, hunkIds: string[], dependsOn: string[] = []) => ({ id, title: id, explanation: "e", rationale: "r", hunkIds, dependsOn, specUrls: [] });
const narrative = (id: string): Artifact<PatchNarrativeData> => ({
  id, sessionId: "S", type: "PatchNarrative", status: "proposed", createdAt: "2", provenance: { taskId: "t" },
  data: { diffId: "D", summary: "sum", changes: [ch("c1", ["f0h0"]), ch("c2", ["f0h1", "f1h0"], ["c1"]), ch("c3", [], ["c1"])] },
});
const state = (artifacts: Artifact[]): SessionState => ({
  session: { id: "S", repo: "/r", title: "t", createdAt: "0" }, artifacts, links: [], tasks: [], lastEventId: 0, searchfox: null,
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

test("latestNarrative picks the newest narrative and its diff", () => {
  assert.equal(latestNarrative(state([diff])), null);
  const r = latestNarrative(state([diff, narrative("N1"), narrative("N2")]));
  assert.equal(r?.narrative.id, "N2");
  assert.equal(r?.diff.id, "D");
});

test("latestNarrative and sessionGraph hide an older narrative when latest Diff is unnarrated", () => {
  const oldDiff = { ...diff, id: "D1", createdAt: "1" };
  const oldNarrative = { ...narrative("N1"), data: { ...narrative("N1").data, diffId: "D1" } };
  const newDiff = { ...diff, id: "D2", createdAt: "3", data: { ...diff.data, baseSha: "b2", headSha: "h2" } };
  const st = state([oldDiff, oldNarrative, newDiff]);
  assert.equal(latestNarrative(st), null);
  assert.equal(sessionGraph(st), null);
});

test("sessionGraph summary node includes revision and pendingComments", () => {
  const withRevision = { ...diff, data: { ...diff.data, commits: [{ sha: "1", subject: "Bug 1", body: "Differential Revision: https://phab.example.com/D5" }] } };
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0", lines: { path: "a.cpp", side: "new" as const, start: 1, end: 1 }, category: "tests" as const, severity: "low" as const, title: "Finding", body: "Body" } };
  const decision = { id: "DEC", sessionId: "S", type: "FindingDecision", status: "verified" as const, createdAt: "5", provenance: { taskId: "user" }, data: { finding: "F", decision: "accepted" as const } };
  const comment = { id: "C", sessionId: "S", type: "ReviewComment", status: "verified" as const, createdAt: "6", provenance: { taskId: "user" }, data: { finding: "F", body: "Ready" } };
  const st = state([withRevision, narrative("N"), finding, decision, comment]);
  st.links = [decision, comment].map((a) => ({ id: `${a.id}-about`, sessionId: "S", from: a.id, to: "F", kind: "about" as const }));
  st.links.push({ id: "finding-narrative", sessionId: "S", from: "F", to: "N", kind: "derivedFrom" });
  const summary = sessionGraph(st)!.nodes.find((n) => n.id === "N")!.data;
  assert.equal(summary.kind, "summary");
  if (summary.kind === "summary") {
    assert.deepEqual(summary.revision, { host: "https://phab.example.com", id: 5 });
    assert.equal(summary.pendingComments, 1);
  }
});

test("pendingComments counts only inline-postable comments", () => {
  const withRevision = { ...diff, data: { ...diff.data, commits: [{ sha: "1", subject: "Bug 1", body: "Differential Revision: https://phab.example.com/D5" }] } };
  const finding = (id: string, lines?: { path: string; side: "new"; start: number; end: number }) => ({ id, sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: id, provenance: { taskId: "t" }, data: { anchor: "D#f0h0", ...(lines ? { lines } : {}), category: "tests" as const, severity: "low" as const, title: id, body: "Body" } });
  const withLines = finding("F1", { path: "a.cpp", side: "new", start: 1, end: 1 });
  const withoutLines = finding("F2");
  const accepted = [withLines, withoutLines].map((f, i) => ({ id: `DEC${i}`, sessionId: "S", type: "FindingDecision", status: "verified" as const, createdAt: `${i}`, provenance: { taskId: "user" }, data: { finding: f.id, decision: "accepted" as const } }));
  const comments = [withLines, withoutLines].map((f, i) => ({ id: `C${i}`, sessionId: "S", type: "ReviewComment", status: "verified" as const, createdAt: `${i}`, provenance: { taskId: "user" }, data: { finding: f.id, body: "Ready" } }));
  const posted = { id: "P", sessionId: "S", type: "PostedComment", status: "verified" as const, createdAt: "9", provenance: { taskId: "runtime" }, data: { comment: "C0", revision: 5, diff: 1, inlineId: 77 } };
  const st = state([withRevision, narrative("N"), withLines, withoutLines, ...accepted, ...comments, posted]);
  st.links = [...accepted, ...comments].map((a) => ({ id: `${a.id}-about`, sessionId: "S", from: a.id, to: a.data.finding, kind: "about" as const }));
  st.links.push(...[withLines, withoutLines].map((f) => ({ id: `${f.id}-narrative`, sessionId: "S", from: f.id, to: "N", kind: "derivedFrom" as const })));
  st.links.push({ id: "posted-about", sessionId: "S", from: "P", to: "C0", kind: "about" });
  const summary = sessionGraph(st)!.nodes.find((n) => n.id === "N")!.data;
  assert.equal(summary.kind, "summary");
  if (summary.kind === "summary") assert.equal(summary.pendingComments, 0);
});

test("narrativeGraph: ids are refs, summary feeds roots, deps feed dependents", () => {
  const g = narrativeGraph(narrative("N"), diff);
  assert.deepEqual(g.nodes.map((n) => n.id), ["N", "N#c1", "N#c2", "N#c3"]);
  assert.deepEqual(g.edges.map((e) => [e.source, e.target]), [["N", "N#c1"], ["N#c1", "N#c2"], ["N#c1", "N#c3"]]);
  const c2 = g.nodes[2].data;
  assert.equal(c2.kind, "change");
  if (c2.kind === "change") {
    assert.deepEqual(c2.hunks.map((h) => [h.file.path, h.hunk.id]), [["a.cpp", "f0h1"], ["b.h", "f1h0"]]);
    assert.deepEqual(c2.files, ["a.cpp", "b.h"]);
    assert.equal(c2.diffId, "D");
  }
});

test("estimateSize grows with level and hunk size", () => {
  const g = narrativeGraph(narrative("N"), diff);
  const c2 = g.nodes[2].data;
  const p = estimateSize(c2, "patch"), c = estimateSize(c2, "concept"), k = estimateSize(c2, "code");
  assert.ok(p.height < c.height && c.height < k.height);
  assert.ok(p.width < k.width);
});

test("layout: dependents below dependencies, no overlaps, deterministic", () => {
  const g = narrativeGraph(narrative("N"), diff);
  const sized = g.nodes.map((n) => ({ id: n.id, ...estimateSize(n.data, "code") }));
  const pos = layout(sized, g.edges);
  assert.deepEqual(layout(sized, g.edges), pos);
  assert.ok(pos.get("N#c2")!.y > pos.get("N#c1")!.y);
  const rects = sized.map((s) => ({ ...s, ...pos.get(s.id)! }));
  for (const a of rects) for (const b of rects) {
    if (a === b) continue;
    const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    assert.ok(!overlap, `${a.id} overlaps ${b.id}`);
  }
});

test("sessionGraph adds spec satellites anchored to supported changes", () => {
  const spec = {
    id: "R", sessionId: "S", type: "SpecReference", status: "verified" as const, createdAt: "3", provenance: { taskId: "t" },
    data: { url: "u", resolved: null, reason: "x", geckoRefs: [] },
  };
  const st = state([diff, narrative("N"), spec]);
  st.links = [{ id: "l1", sessionId: "S", from: "R", to: "N#c2", kind: "supports" }];
  const g = sessionGraph(st)!;
  const r = g.nodes.find((n) => n.id === "R")!;
  assert.equal(r.data.kind, "spec");
  assert.deepEqual(r.anchors, ["N#c2"]);
  assert.ok(g.edges.some((e) => e.source === "R" && e.target === "N#c2"));
  assert.equal(sessionGraph(state([diff])), null);
});

test("sessionGraph exposes unenabled MCP requests per thread", () => {
  const thread = { id: "T", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "N#c1" } };
  const request = { id: "REQ", sessionId: "S", type: "McpServerRequest", status: "proposed" as const, createdAt: "5", provenance: { taskId: "t" }, data: { server: "firefox-devtools" } };
  const st = state([diff, narrative("N"), thread, request]);
  st.links = [{ id: "about", sessionId: "S", from: "REQ", to: "T", kind: "about" }];
  const chat = sessionGraph(st)!.nodes.find((node) => node.id === "T")!.data;
  assert.equal(chat.kind, "chat");
  if (chat.kind === "chat") assert.deepEqual(chat.mcpRequests, ["firefox-devtools"]);

  const enabled = { id: "EN", sessionId: "S", type: "McpServerEnabled", status: "verified" as const, createdAt: "6", provenance: { taskId: "user" }, data: { server: "firefox-devtools" } };
  st.artifacts.push(enabled);
  st.links.push({ id: "enabled-about", sessionId: "S", from: "EN", to: "T", kind: "about" });
  const afterEnable = sessionGraph(st)!.nodes.find((node) => node.id === "T")!.data;
  if (afterEnable.kind === "chat") assert.deepEqual(afterEnable.mcpRequests, []);

  st.artifacts.push({ ...thread, id: "T2", data: { anchor: "N#c2" } }, { ...request, id: "REQ2", data: { server: "firefox-devtools" } });
  st.links.push({ id: "about2", sessionId: "S", from: "REQ2", to: "T2", kind: "about" });
  const otherThread = sessionGraph(st)!.nodes.find((node) => node.id === "T2")!.data;
  if (otherThread.kind === "chat") assert.deepEqual(otherThread.mcpRequests, ["firefox-devtools"]);
});

test("sessionGraph ignores spec refs of older narratives", () => {
  const spec = { id: "R", sessionId: "S", type: "SpecReference", status: "verified" as const, createdAt: "3", provenance: { taskId: "t" }, data: { url: "u", resolved: null, geckoRefs: [] } };
  const st = state([diff, narrative("N1"), narrative("N2"), spec]);
  st.links = [{ id: "l1", sessionId: "S", from: "R", to: "N1#c2", kind: "supports" }];
  assert.ok(!sessionGraph(st)!.nodes.some((n) => n.id === "R"));
});

test("summary spec status requires a succeeded resolver for this narrative", () => {
  const refs = [
    { id: "RC", sessionId: "S", type: "SpecReference", status: "verified" as const, createdAt: "3", provenance: { taskId: "t" }, data: { url: "code", origin: "code" as const, resolved: null, geckoRefs: [] } },
    { id: "RI", sessionId: "S", type: "SpecReference", status: "verified" as const, createdAt: "3", provenance: { taskId: "t" }, data: { url: "llm", origin: "llm" as const, resolved: null, geckoRefs: [] } },
    { id: "RP", sessionId: "S", type: "SpecReference", status: "proposed" as const, createdAt: "3", provenance: { taskId: "t" }, data: { url: "proposed", origin: "code" as const, resolved: null, geckoRefs: [] } },
  ];
  const st = state([diff, narrative("N"), ...refs]);
  st.links = refs.map((r, i) => ({ id: `l${i}`, sessionId: "S", from: r.id, to: `N#c${i + 1}`, kind: "supports" as const }));
  const summary = () => sessionGraph(st)!.nodes[0].data;
  let data = summary();
  assert.equal(data.kind, "summary");
  if (data.kind === "summary") assert.equal(data.specStatus, null);

  st.tasks = [{ id: "resolve", sessionId: "S", kind: "resolveSpecRefs", status: "succeeded", input: { narrativeId: "N" }, output: null, error: null, createdAt: "4", updatedAt: "4" }];
  data = summary();
  if (data.kind === "summary") assert.deepEqual(data.specStatus, { code: 1, inferred: 1, unverified: 1 });

  st.tasks = [{ ...st.tasks[0]!, input: { narrativeId: "other" } }];
  data = summary();
  if (data.kind === "summary") assert.equal(data.specStatus, null);
  st.tasks = [{ ...st.tasks[0]!, input: { narrativeId: "N" } }];
  st.artifacts = [diff, narrative("N")];
  st.links = [];
  data = summary();
  if (data.kind === "summary") assert.deepEqual(data.specStatus, { code: 0, inferred: 0, unverified: 0 });
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

test("anchorNodeId maps change refs and hunk refs to change nodes", () => {
  const n = narrative("N");
  assert.equal(anchorNodeId("N#c2", "N", n.data, "D"), "N#c2");
  assert.equal(anchorNodeId("D#f1h0", "N", n.data, "D"), "N#c2");
  assert.equal(anchorNodeId("OLD#c1", "N", n.data, "D"), null);
  assert.equal(anchorNodeId("D#f9h9", "N", n.data, "D"), null);
});

test("anchorNodeId resolves summaries, specs, chats and chat messages to graph nodes", () => {
  const n = narrative("N");
  const nodes = new Set(["N", "R", "T"]);
  const links = [{ id: "reply", sessionId: "S", from: "M", to: "T", kind: "reply" as const }, { id: "reply2", sessionId: "S", from: "M2", to: "T2", kind: "reply" as const }];
  assert.equal(anchorNodeId("R", "N", n.data, "D", nodes, links), "R");
  assert.equal(anchorNodeId("N", "N", n.data, "D", nodes, links), "N");
  assert.equal(anchorNodeId("T", "N", n.data, "D", nodes, links), "T");
  assert.equal(anchorNodeId("M", "N", n.data, "D", nodes, links), "T");
  assert.equal(anchorNodeId("M2", "N", n.data, "D", nodes, links), null);
  assert.equal(anchorNodeId("R2", "N", n.data, "D", nodes, links), null);
});

test("sessionGraph skips a chat anchored to a change in an older narrative", () => {
  const oldThread = { id: "T-old", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "N1#c1" } };
  const g = sessionGraph(state([diff, narrative("N1"), narrative("N2"), oldThread]))!;
  assert.ok(!g.nodes.some((n) => n.id === "T-old"));
});

test("sessionGraph skips a chat anchored to a message of a hidden chat", () => {
  const hidden = { id: "T1", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "N1#c1" } };
  const message = { id: "M1", sessionId: "S", type: "ChatMessage", status: "verified" as const, createdAt: "5", provenance: { taskId: "t" }, data: { role: "assistant" as const, text: "answer" } };
  const nested = { id: "T2", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "6", provenance: { taskId: "t" }, data: { anchor: "M1" } };
  const st = state([diff, narrative("N1"), narrative("N2"), hidden, message, nested]);
  st.links = [{ id: "reply", sessionId: "S", from: "M1", to: "T1", kind: "reply" }];
  const g = sessionGraph(st)!;
  assert.ok(!g.nodes.some((n) => n.id === "T1" || n.id === "T2"));
});

test("sessionGraph attaches revisions to their target chat message", () => {
  const thread = { id: "T", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0" } };
  const msg = { id: "M", sessionId: "S", type: "ChatMessage", status: "verified" as const, createdAt: "5", provenance: { taskId: "t" }, data: { role: "assistant" as const, text: "Stub answer." } };
  const revision = { id: "REV", sessionId: "S", type: "Revision", status: "proposed" as const, createdAt: "6", provenance: { taskId: "t" }, data: { quote: "Stub answer.", correction: "Corrected stub answer." } };
  const st = state([diff, narrative("N"), thread, msg, revision]);
  st.links = [
    { id: "reply", sessionId: "S", from: "M", to: "T", kind: "reply" },
    { id: "revises", sessionId: "S", from: "REV", to: "M", kind: "revises" },
  ];
  const chat = sessionGraph(st)!.nodes.find((node) => node.id === "T")!.data;
  assert.equal(chat.kind, "chat");
  if (chat.kind === "chat") assert.deepEqual(chat.revisions.M, [revision.data]);
});

test("sessionGraph adds chat satellites for threads and drafts", () => {
  const thread = { id: "T", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0" } };
  const msg = { id: "M", sessionId: "S", type: "ChatMessage", status: "verified" as const, createdAt: "5", provenance: { taskId: "t" }, data: { role: "user", text: "q" } };
  const st = state([diff, narrative("N"), thread, msg]);
  st.links = [{ id: "l", sessionId: "S", from: "M", to: "T", kind: "reply" }];
  const g = sessionGraph(st, [{ id: "draft-1", anchor: "N#c3" }])!;
  const chat = g.nodes.find((x) => x.id === "T")!;
  assert.deepEqual(chat.anchors, ["N#c1"]);
  assert.equal(chat.data.kind === "chat" && chat.data.messages.length, 1);
  const draft = g.nodes.find((x) => x.id === "draft-1")!;
  assert.deepEqual(draft.anchors, ["N#c3"]);
});

test("chat satellites can anchor to spec, another chat, and narrative summary", () => {
  const spec = { id: "R", sessionId: "S", type: "SpecReference", status: "verified" as const, createdAt: "3", provenance: { taskId: "t" }, data: { url: "u", resolved: null, geckoRefs: [] } };
  const first = { id: "T1", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "N#c1" } };
  const message = { id: "M1", sessionId: "S", type: "ChatMessage", status: "verified" as const, createdAt: "5", provenance: { taskId: "t" }, data: { role: "assistant" as const, text: "answer" } };
  const onSpec = { id: "T2", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "6", provenance: { taskId: "t" }, data: { anchor: "R" } };
  const onChat = { id: "T3", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "7", provenance: { taskId: "t" }, data: { anchor: "M1" } };
  const onSummary = { id: "T4", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "8", provenance: { taskId: "t" }, data: { anchor: "N" } };
  const st = state([diff, narrative("N"), spec, first, message, onSpec, onChat, onSummary]);
  st.links = [
    { id: "support", sessionId: "S", from: "R", to: "N#c1", kind: "supports" },
    { id: "reply", sessionId: "S", from: "M1", to: "T1", kind: "reply" },
  ];
  const g = sessionGraph(st)!;
  assert.deepEqual(g.nodes.find((n) => n.id === "T2")?.anchors, ["R"]);
  assert.deepEqual(g.nodes.find((n) => n.id === "T3")?.anchors, ["T1"]);
  assert.deepEqual(g.nodes.find((n) => n.id === "T4")?.anchors, ["N"]);
});

test("sessionGraph adds findings and skips findings from older diffs", () => {
  const findingData: ReviewFindingData = { anchor: "D#f0h0", quote: "l0", lines: { path: "a.cpp", side: "new", start: 1, end: 1 }, category: "correctness", severity: "high", title: "Finding", body: "Body" };
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: findingData };
  const stale = { ...finding, id: "F-old", data: { ...findingData, anchor: "OLD#f0h0" } };
  const g = sessionGraph(state([diff, narrative("N"), finding, stale]))!;
  const node = g.nodes.find((n) => n.id === "F")!;
  assert.equal(node.data.kind, "finding");
  if (node.data.kind === "finding") assert.deepEqual({ quote: node.data.quote, lines: node.data.lines, severity: node.data.severity }, { quote: "l0", lines: findingData.lines, severity: "high" });
  assert.deepEqual(node.anchors, ["N#c1"]);
  assert.ok(g.edges.some((e) => e.source === "F" && e.target === "N#c1"));
  assert.ok(!g.nodes.some((n) => n.id === "F-old"));
});

test("sessionGraph finding node includes latest decision and comment", () => {
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0", category: "tests", severity: "low", title: "Finding", body: "Body" } };
  const decision = { id: "DEC", sessionId: "S", type: "FindingDecision", status: "verified" as const, createdAt: "5", provenance: { taskId: "user" }, data: { finding: "F", decision: "accepted" } };
  const comment = { id: "C", sessionId: "S", type: "ReviewComment", status: "verified" as const, createdAt: "6", provenance: { taskId: "user" }, data: { finding: "F", body: "Use a strong ref." } };
  const st = state([diff, narrative("N"), finding, decision, comment]);
  st.links = [
    { id: "decision-about", sessionId: "S", from: "DEC", to: "F", kind: "about" },
    { id: "comment-about", sessionId: "S", from: "C", to: "F", kind: "about" },
  ];
  const node = sessionGraph(st)!.nodes.find((n) => n.id === "F")!.data;
  assert.equal(node.kind, "finding");
  if (node.kind === "finding") {
    assert.equal(node.decision, "accepted");
    assert.deepEqual(node.comment, { id: "C", body: "Use a strong ref.", status: "verified" });
    assert.equal(node.postedTo, null);
  }
});

test("sessionGraph finding exposes posted revision for its latest comment", () => {
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0", category: "tests", severity: "low", title: "Finding", body: "Body" } };
  const comment = { id: "C", sessionId: "S", type: "ReviewComment", status: "verified" as const, createdAt: "5", provenance: { taskId: "user" }, data: { finding: "F", body: "Ready" } };
  const posted = { id: "P", sessionId: "S", type: "PostedComment", status: "verified" as const, createdAt: "6", provenance: { taskId: "runtime" }, data: { comment: "C", revision: 12, diff: 8, inlineId: 77 } };
  const st = state([diff, narrative("N"), finding, comment, posted]);
  st.links = [{ id: "comment-about", sessionId: "S", from: "C", to: "F", kind: "about" }];
  const node = sessionGraph(st)!.nodes.find((n) => n.id === "F")!.data;
  assert.equal(node.kind, "finding");
  if (node.kind === "finding") assert.equal(node.postedTo, 12);
});

test("sessionGraph finding without status artifacts has null decision and comment", () => {
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0", category: "tests", severity: "low", title: "Finding", body: "Body" } };
  const node = sessionGraph(state([diff, narrative("N"), finding]))!.nodes.find((n) => n.id === "F")!.data;
  assert.equal(node.kind, "finding");
  if (node.kind === "finding") {
    assert.equal(node.decision, null);
    assert.equal(node.comment, null);
  }
});

test("sessionGraph finding reflects dismissal and latest decision wins", () => {
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0", category: "tests", severity: "low", title: "Finding", body: "Body" } };
  const accepted = { id: "DEC1", sessionId: "S", type: "FindingDecision", status: "verified" as const, createdAt: "5", provenance: { taskId: "user" }, data: { finding: "F", decision: "accepted" } };
  const dismissed = { ...accepted, id: "DEC2", createdAt: "6", data: { finding: "F", decision: "dismissed" } };
  const st = state([diff, narrative("N"), finding, accepted, dismissed]);
  st.links = [accepted, dismissed].map((a) => ({ id: `${a.id}-about`, sessionId: "S", from: a.id, to: "F", kind: "about" as const }));
  const node = sessionGraph(st)!.nodes.find((n) => n.id === "F")!.data;
  assert.equal(node.kind, "finding");
  if (node.kind === "finding") assert.equal(node.decision, "dismissed");
});

test("a finding's thread lives in the finding node, and chats on its messages anchor to the finding", () => {
  const findingData: ReviewFindingData = { anchor: "D#f0h0", category: "tests", severity: "low", title: "Finding", body: "Body" };
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: findingData };
  const thread = { id: "T", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "5", provenance: { taskId: "turn" }, data: { anchor: "F" } };
  const msg = { id: "M", sessionId: "S", type: "ChatMessage", status: "verified" as const, createdAt: "6", provenance: { taskId: "turn" }, data: { role: "assistant" as const, text: "answer" } };
  const onMessage = { id: "T2", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "7", provenance: { taskId: "t2" }, data: { anchor: "M" } };
  const st = state([diff, narrative("N"), finding, thread, msg, onMessage]);
  st.links = [{ id: "reply", sessionId: "S", from: "M", to: "T", kind: "reply" }];
  const g = sessionGraph(st)!;
  assert.ok(!g.nodes.some((n) => n.id === "T"));
  const node = g.nodes.find((n) => n.id === "F")!.data;
  assert.equal(node.kind, "finding");
  if (node.kind === "finding") assert.deepEqual({ threadId: node.thread?.threadId, taskId: node.thread?.taskId, messages: node.thread?.messages.map((m) => m.id) }, { threadId: "T", taskId: "turn", messages: ["M"] });
  assert.deepEqual(g.nodes.find((n) => n.id === "T2")?.anchors, ["F"]);
});

test("visibleGraph hides collapsed quoted findings, but keeps unquoted findings", () => {
  const finding = (id: string, quote?: string): GraphNode => ({ id, data: { kind: "finding", findingId: id, diffId: "D", hunks: [], anchor: "D#f0h0", ...(quote ? { quote } : {}), category: "tests", severity: "low", title: id, body: "body", thread: null, decision: null, comment: null, postedTo: null } });
  const g = { nodes: [finding("quoted", "l0"), finding("plain")], edges: [{ id: "q", source: "quoted", target: "N#c1" }, { id: "p", source: "plain", target: "N#c1" }] };
  const visible = visibleGraph(g, new Set(["quoted", "plain"]));
  assert.deepEqual(visible.nodes.map((n) => n.id), ["plain"]);
  assert.deepEqual(visible.edges.map((e) => e.id), ["p"]);
});

test("estimateSize gives findings the satellite width", () => {
  const data = { kind: "finding" as const, findingId: "F", diffId: "D", hunks: [], anchor: "D#f0h0", quote: "l0", category: "tests" as const, severity: "low" as const, title: "T", body: "body", thread: null, decision: null, comment: null, postedTo: null };
  assert.deepEqual(estimateSize(data, "concept"), { width: SATELLITE_WIDTH, height: 110 + 20 });
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
    node("quoted", { kind: "chat", anchor: "N#c1", quote: "quote", diffId: "D", hunks: [], threadId: "quoted", draftId: null, taskId: null, messages: [], revisions: {}, mcpRequests: [] }),
    node("plain", { kind: "chat", anchor: "N#c1", diffId: "D", hunks: [], threadId: "plain", draftId: null, taskId: null, messages: [], revisions: {}, mcpRequests: [] }),
    node("draft", { kind: "chat", anchor: "N#c1", quote: "draft quote", diffId: "D", hunks: [], threadId: null, draftId: "draft", taskId: null, messages: [], revisions: {}, mcpRequests: [] }),
    node("N#c1", { kind: "change", narrativeId: "N", diffId: "D", change: ch("c1", []), hunks: [], files: [] }),
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
