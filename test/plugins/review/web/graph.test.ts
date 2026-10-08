import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReviewFindingData } from "../../../../src/plugins/review/shared/types.ts";
import type { Artifact, DiagramData, DiffData, PatchNarrativeData, SessionState, WorkflowStartData } from "../../../../src/shared/types.ts";
import { closeGraph, conversationGraph, isCoreKind, layout, placeSatellites, sessionGraph as buildSessionGraph, visibleGraph, NODE_WIDTH, SATELLITE_WIDTH, type GraphNode, type GraphNodeData, type ZoomLevel } from "../../../../src/web/graph.ts";
import type { Draft } from "../../../../src/web/chat-context.ts";
import type { FreePosition } from "../../../../src/web/free-positions.ts";
import { anchorNodeId, diagramLayoutEdges, diagramStepTarget, isReviewKind, latestNarrative, layerGraph, levelGraph, narrativeGraph, reviewGraph, reviewSize, stackLayout, stepNodeId, type ChangeNodeData } from "../../../../src/plugins/review/web/graph.ts";

const sessionGraph = (st: SessionState, drafts?: Draft[], freePositions?: Record<string, FreePosition>) => buildSessionGraph(st.session.workflow === "review" ? reviewGraph : conversationGraph, st, drafts, freePositions);
const estimateSize = (data: GraphNodeData, level: ZoomLevel, textScale = 1) => {
  const size = reviewSize(data, level);
  return { width: size.width * textScale, height: size.height * textScale };
};

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

test("review graph hosts the session request and earliest root thread before the summary", () => {
  const start = { id: "W", sessionId: "S", type: "WorkflowStart", status: "proposed", createdAt: "0", provenance: { taskId: "t" }, data: { via: "selector", workflow: "review", params: {}, title: "Review", prompt: "Check this patch" } , epoch: null} as Artifact<WorkflowStartData>;
  const laterStart = { ...start, id: "W2", data: { ...start.data, prompt: "Latest request" } };
  const aside = { id: "TA", sessionId: "S", type: "ChatThread", status: "proposed", createdAt: "2", provenance: { taskId: "t" }, data: { anchor: "W2", aside: true } , epoch: null} as Artifact;
  const root = { id: "T0", sessionId: "S", type: "ChatThread", status: "proposed", createdAt: "3", provenance: { taskId: "t" }, data: { anchor: "W2" } , epoch: null} as Artifact;
  const laterRoot = { ...root, id: "T1", createdAt: "4" };
  const st = state([diff, narrative("N"), start, laterStart, aside, root, laterRoot]);
  const graph = sessionGraph(st)!;
  assert.equal(graph.nodes[0]?.id, "N");
  const conversation = graph.nodes.find((node) => node.data.kind === "conversation")!;
  assert.equal(conversation.id, "W2");
  assert.deepEqual(conversation.anchors, ["N"]);
  assert.ok(graph.edges.some((edge) => edge.source === "W2" && edge.target === "N"));
  if (conversation.data.kind === "conversation") {
    assert.equal(conversation.data.prompt, "Latest request");
    assert.equal(conversation.data.threadId, "T0");
  }
});

test("conversation prompt falls back to the workflow command when empty", () => {
  const start = { id: "W", sessionId: "S", type: "WorkflowStart", status: "proposed", createdAt: "0", provenance: { taskId: "t" }, data: { via: "selector", workflow: "review", params: {}, title: "Review", prompt: "" } , epoch: null} as Artifact<WorkflowStartData>;
  const conversation = sessionGraph(state([diff, narrative("N"), start]))!.nodes.find((node) => node.data.kind === "conversation");
  assert.equal(conversation?.data.kind === "conversation" ? conversation.data.prompt : null, "/review");
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

test("sessionGraph summary node includes per-revision drafts", () => {
  const withRevision = { ...diff, data: { ...diff.data, commits: [{ sha: "1", subject: "Bug 1", body: "Differential Revision: https://phab.example.com/D5" }] } };
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0", lines: { path: "a.cpp", side: "new" as const, start: 1, end: 1 }, category: "tests" as const, severity: "low" as const, title: "Finding", body: "Body" } , epoch: null};
  const decision = { id: "DEC", sessionId: "S", type: "FindingDecision", status: "verified" as const, createdAt: "5", provenance: { taskId: "user" }, data: { finding: "F", decision: "accepted" as const } , epoch: null};
  const comment = { id: "C", sessionId: "S", type: "ReviewComment", status: "verified" as const, createdAt: "6", provenance: { taskId: "user" }, data: { finding: "F", body: "Ready" } , epoch: null};
  const st = state([withRevision, narrative("N"), finding, decision, comment]);
  st.links = [
    ...[decision, comment].map((a) => ({ id: `${a.id}-about`, sessionId: "S", from: a.id, to: "F", kind: "about" as const })),
    { id: "finding-derived", sessionId: "S", from: "F", to: "N", kind: "derivedFrom" },
  ];
  st.links.push({ id: "finding-narrative", sessionId: "S", from: "F", to: "N", kind: "derivedFrom" });
  const summary = sessionGraph(st)!.nodes.find((n) => n.id === "N")!.data;
  assert.equal(summary.kind, "summary");
  if (isReviewKind(summary, "summary")) {
    assert.deepEqual(summary.drafts, [{ commit: 0, revision: 5, count: 1 }]);
    assert.equal(summary.skipped, 0);
  }
});

test("drafts count only inline-postable comments", () => {
  const withRevision = { ...diff, data: { ...diff.data, commits: [{ sha: "1", subject: "Bug 1", body: "Differential Revision: https://phab.example.com/D5" }] } };
  const finding = (id: string, lines?: { path: string; side: "new"; start: number; end: number }) => ({ id, sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: id, provenance: { taskId: "t" }, data: { anchor: "D#f0h0", ...(lines ? { lines } : {}), category: "tests" as const, severity: "low" as const, title: id, body: "Body" } , epoch: null});
  const withLines = finding("F1", { path: "a.cpp", side: "new", start: 1, end: 1 });
  const withoutLines = finding("F2");
  const accepted = [withLines, withoutLines].map((f, i) => ({ id: `DEC${i}`, sessionId: "S", type: "FindingDecision", status: "verified" as const, createdAt: `${i}`, provenance: { taskId: "user" }, data: { finding: f.id, decision: "accepted" as const } , epoch: null}));
  const comments = [withLines, withoutLines].map((f, i) => ({ id: `C${i}`, sessionId: "S", type: "ReviewComment", status: "verified" as const, createdAt: `${i}`, provenance: { taskId: "user" }, data: { finding: f.id, body: "Ready" } , epoch: null}));
  const posted = { id: "P", sessionId: "S", type: "PostedComment", status: "verified" as const, createdAt: "9", provenance: { taskId: "runtime" }, data: { comment: "C0", revision: 5, diff: 1, inlineId: 77 } , epoch: null};
  const st = state([withRevision, narrative("N"), withLines, withoutLines, ...accepted, ...comments, posted]);
  st.links = [...accepted, ...comments].map((a) => ({ id: `${a.id}-about`, sessionId: "S", from: a.id, to: a.data.finding, kind: "about" as const }));
  st.links.push(...[withLines, withoutLines].map((f) => ({ id: `${f.id}-narrative`, sessionId: "S", from: f.id, to: "N", kind: "derivedFrom" as const })));
  st.links.push({ id: "posted-about", sessionId: "S", from: "P", to: "C0", kind: "about" });
  const summary = sessionGraph(st)!.nodes.find((n) => n.id === "N")!.data;
  assert.equal(summary.kind, "summary");
  if (isReviewKind(summary, "summary")) {
    assert.deepEqual(summary.drafts, []);
    assert.equal(summary.skipped, 1);
  }
});

test("sessionGraph groups stack drafts by owning commit in order", () => {
  const stackDiff = { ...diff, data: {
    ...diff.data,
    commits: [
      { sha: "1111111", subject: "First", body: "Differential Revision: https://phab.example.com/D5" },
      { sha: "2222222", subject: "Second", body: "Differential Revision: https://phab.example.com/D6" },
    ],
    files: [{ path: "a.cpp", status: "modified" as const, binary: false, hunks: [{
      ...hunk("f0h0", 2), oldStart: 0, oldLines: 1, newStart: 1, newLines: 2,
      lines: [
        { kind: "add" as const, text: "first", commit: 0, commitLine: 4 },
        { kind: "add" as const, text: "second", commit: 1, commitLine: 9 },
      ],
    }, { ...hunk("f0h1", 40), oldStart: 100, newStart: 100 }] }, diff.data.files[1]!],
  } };
  const finding = (id: string, start: number) => ({ id, sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: id, provenance: { taskId: "t" }, data: { anchor: "D#f0h0", lines: { path: "a.cpp", side: "new" as const, start, end: start }, category: "tests" as const, severity: "low" as const, title: id, body: "Body" } , epoch: null});
  const findings = [finding("F0", 1), finding("F1", 2)];
  const decisions = findings.map((f, i) => ({ id: `DEC${i}`, sessionId: "S", type: "FindingDecision", status: "verified" as const, createdAt: `${i}`, provenance: { taskId: "user" }, data: { finding: f.id, decision: "accepted" as const } , epoch: null}));
  const comments = findings.map((f, i) => ({ id: `C${i}`, sessionId: "S", type: "ReviewComment", status: "verified" as const, createdAt: `${i}`, provenance: { taskId: "user" }, data: { finding: f.id, body: "Ready" } , epoch: null}));
  const st = state([stackDiff, narrative("N"), ...findings, ...decisions, ...comments]);
  st.links = [...decisions, ...comments].map((a) => ({ id: `${a.id}-about`, sessionId: "S", from: a.id, to: a.data.finding, kind: "about" as const }));
  st.links.push(...findings.map((f) => ({ id: `${f.id}-narrative`, sessionId: "S", from: f.id, to: "N", kind: "derivedFrom" as const })));
  const summary = sessionGraph(st)!.nodes.find((n) => n.id === "N")!.data;
  assert.equal(summary.kind, "summary");
  if (isReviewKind(summary, "summary")) assert.deepEqual(summary.drafts, [
    { commit: 0, revision: 5, count: 1 },
    { commit: 1, revision: 6, count: 1 },
  ]);
});

test("narrativeGraph: ids are refs, summary feeds roots, deps feed dependents", () => {
  const g = narrativeGraph(narrative("N"), diff, [diff]);
  assert.deepEqual(g.nodes.map((n) => n.id), ["N", "N#c1", "N#c2", "N#c3"]);
  assert.deepEqual(g.edges.map((e) => [e.source, e.target]), [["N", "N#c1"], ["N#c1", "N#c2"], ["N#c1", "N#c3"]]);
  const c2 = g.nodes[2].data;
  assert.equal(c2.kind, "change");
  if (isReviewKind(c2, "change")) {
    assert.deepEqual(c2.hunks.map((h) => [h.file.path, h.hunk.id]), [["a.cpp", "f0h1"], ["b.h", "f1h0"]]);
    assert.deepEqual(c2.files, ["a.cpp", "b.h"]);
    assert.equal(c2.diffId, "D");
  }
});

const stackDiff: Artifact<DiffData> = {
  ...diff, id: "DS", data: { ...diff.data, commits: [
    { sha: "1", subject: "Part 1", body: "" }, { sha: "2", subject: "Part 2", body: "" },
  ], files: [
    { path: "a.cpp", status: "modified", binary: false, hunks: [
      { ...hunk("f0h0", 1), lines: [{ kind: "add", text: "one", commit: 0 }] },
      { ...hunk("f0h1", 1), lines: [{ kind: "add", text: "two", commit: 1 }] },
    ] },
    { path: "b.h", status: "modified", binary: false, hunks: [{ ...hunk("f1h0", 1), lines: [{ kind: "add", text: "three", commit: 0 }] }] },
  ] },
};
const stackNarrative: Artifact<PatchNarrativeData> = {
  ...narrative("NS"), data: { diffId: "DS", summary: "sum", commitIntents: ["first", "second"], changes: [
    ch("c1", ["f0h0"]), ch("c2", ["f1h0"], ["c1"]), ch("c3", ["f0h1"], ["c1"]),
  ] },
};

test("narrativeGraph creates ordered commit cards and assigns changes to lanes", () => {
  const g = narrativeGraph(stackNarrative, stackDiff, [stackDiff]);
  assert.deepEqual(g.nodes.map((n) => n.id), ["NS", "NS#commit-0", "NS#commit-1", "NS#c1", "NS#c2", "NS#c3"]);
  assert.deepEqual(g.edges.map(({ source, target }) => [source, target]), [
    ["NS", "NS#commit-0"], ["NS", "NS#commit-1"], ["NS#commit-0", "NS#c1"], ["NS#c1", "NS#c2"], ["NS#c1", "NS#c3"],
  ]);
  assert.deepEqual(g.nodes.filter((n) => isReviewKind(n.data, "change")).map((n) => isReviewKind(n.data, "change") ? n.data.commit : null), [0, 0, 1]);
  assert.deepEqual(g.nodes.filter((n) => isReviewKind(n.data, "commit")).map((n) => isReviewKind(n.data, "commit") ? [n.data.intent, n.data.changeCount] : null), [["first", 2], ["second", 1]]);
  const single = narrativeGraph(narrative("N"), diff, [diff]);
  assert.equal(single.nodes.some((n) => isReviewKind(n.data, "commit")), false);
  assert.ok(single.nodes.filter((n) => isReviewKind(n.data, "change")).every((n) => isReviewKind(n.data, "change") && n.data.commit === null));
});

test("narrativeGraph adds reviewed state and per-commit reviewed counts", () => {
  const mark = (id: string, change: string, reviewed: boolean): Artifact => ({
    id, sessionId: "S", type: "ChangeReview", status: "verified", createdAt: id,
    provenance: { taskId: "user" }, data: { narrative: "NS", change, reviewed },
    epoch: null,});
  const graph = narrativeGraph(stackNarrative, stackDiff, [stackDiff, mark("r1", "c1", true), mark("r2", "c2", true), mark("r3", "c2", false)]);
  const changes = graph.nodes.filter((node) => isReviewKind(node.data, "change"));
  const cards = graph.nodes.filter((node) => isReviewKind(node.data, "commit"));
  assert.deepEqual(changes.map((node) => isReviewKind(node.data, "change") && [node.data.change.id, node.data.reviewed]), [["c1", true], ["c2", false], ["c3", false]]);
  assert.deepEqual(cards.map((node) => isReviewKind(node.data, "commit") && node.data.reviewedCount), [1, 0]);
});

test("levelGraph collapses stack changes at patch zoom only", () => {
  const g = narrativeGraph(stackNarrative, stackDiff, [stackDiff]);
  assert.deepEqual(levelGraph(g, "patch").nodes.map((n) => n.id), ["NS", "NS#commit-0", "NS#commit-1"]);
  assert.deepEqual(levelGraph(g, "patch").edges.map(({ source, target }) => [source, target]), [["NS", "NS#commit-0"], ["NS", "NS#commit-1"]]);
  assert.equal(levelGraph(g, "concept"), g);
  const single = narrativeGraph(narrative("N"), diff, [diff]);
  assert.equal(levelGraph(single, "patch"), single);
});

test("sessionGraph counts active findings on their owning commit cards", () => {
  const finding = (id: string, anchor: string) => ({ id, sessionId: "S", type: "ReviewFinding" as const, status: "proposed" as const, createdAt: id, provenance: { taskId: "t" }, data: { anchor, category: "tests" as const, severity: "low" as const, title: id, body: "Body" } , epoch: null});
  const active = finding("F1", "DS#f0h1"), dismissed = finding("F0", "DS#f0h0");
  const decision = { id: "DEC", sessionId: "S", type: "FindingDecision" as const, status: "verified" as const, createdAt: "z", provenance: { taskId: "user" }, data: { finding: "F0", decision: "dismissed" as const } , epoch: null};
  const st = state([stackDiff, stackNarrative, active, dismissed, decision]);
  st.links.push({ id: "dismissed-about", sessionId: "S", from: "DEC", to: "F0", kind: "about" });
  const graph = sessionGraph(st)!;
  const card1 = graph.nodes.find((n) => n.id === "NS#commit-1")!;
  const card0 = graph.nodes.find((n) => n.id === "NS#commit-0")!;
  assert.equal(isReviewKind(card1.data, "commit") ? card1.data.findingCount : -1, 1);
  assert.equal(isReviewKind(card0.data, "commit") ? card0.data.findingCount : -1, 0);
});

test("stackLayout keeps lanes and their satellites separate below the summary", () => {
  const graph = narrativeGraph(stackNarrative, stackDiff, [stackDiff]);
  const nodes = [...graph.nodes,
    { id: "F1", anchors: ["NS#c1"], data: { kind: "finding", findingId: "F1", ai: true, diffId: "DS", hunks: [], anchor: "NS#c1", category: "tests", severity: "low", title: "F1", body: "body", thread: null, decision: null, comment: null, postedTo: null, status: "open", outdated: false, verdict: null, fromEpoch: null, collapsedByDefault: false } },
    { id: "F3", anchors: ["NS#c3"], data: { kind: "finding", findingId: "F3", ai: true, diffId: "DS", hunks: [], anchor: "NS#c3", category: "tests", severity: "low", title: "F3", body: "body", thread: null, decision: null, comment: null, postedTo: null, status: "open", outdated: false, verdict: null, fromEpoch: null, collapsedByDefault: false } },
    { id: "FS", anchors: ["NS"], data: { kind: "finding", findingId: "FS", ai: true, diffId: "DS", hunks: [], anchor: "NS", category: "tests", severity: "low", title: "FS", body: "body", thread: null, decision: null, comment: null, postedTo: null, status: "open", outdated: false, verdict: null, fromEpoch: null, collapsedByDefault: false } },
  ] as GraphNode[];
  const sized = nodes.map((n) => ({ id: n.id, data: n.data, anchors: n.anchors ?? [], ...estimateSize(n.data, "concept") }));
  const pos = stackLayout(sized, graph.edges);
  assert.equal(pos.size, nodes.length);
  const right = (id: string) => pos.get(id)!.x + estimateSize(nodes.find((n) => n.id === id)!.data, "concept").width;
  const laneOneX = pos.get("NS#commit-1")!.x;
  for (const id of ["NS#commit-0", "NS#c1", "NS#c2", "F1"]) assert.ok(right(id) < laneOneX, `${id} must fit left of lane 1`);
  assert.ok(pos.get("NS#commit-0")!.y < pos.get("NS#c1")!.y);
  assert.ok(pos.get("NS#commit-0")!.y < pos.get("NS#c2")!.y);
  assert.ok(pos.get("F1")!.x > right("NS#c1"));
  assert.equal(pos.get("NS")!.y, 0);
  assert.ok(pos.get("NS#commit-0")!.y >= pos.get("FS")!.y + estimateSize(nodes.find((n) => n.id === "FS")!.data, "concept").height);
  assert.ok(pos.get("NS#c3")!.y > pos.get("NS#commit-1")!.y);
});

test("commit card estimates match node widths and shrink at patch level", () => {
  const g = narrativeGraph(stackNarrative, stackDiff, [stackDiff]);
  const card = g.nodes.find((n) => isReviewKind(n.data, "commit"))!.data;
  const patch = estimateSize(card, "patch"), concept = estimateSize(card, "concept");
  assert.ok(patch.height < concept.height);
  assert.equal(patch.width, NODE_WIDTH.patch);
  assert.equal(concept.width, NODE_WIDTH.concept);
});

test("estimateSize grows with level and hunk size", () => {
  const g = narrativeGraph(narrative("N"), diff, [diff]);
  const c2 = g.nodes[2].data;
  const p = estimateSize(c2, "patch"), c = estimateSize(c2, "concept"), k = estimateSize(c2, "code");
  assert.ok(p.height < c.height && c.height < k.height);
  assert.ok(p.width < k.width);
  if (isReviewKind(c2, "change")) assert.ok(estimateSize({ ...c2, threads: [{ threadId: "T", draftId: null, taskId: null, messages: [], revisions: {}, mcpRequests: [], anchor: "N#c2", diffId: "D", hunks: [] }] }, "concept").height > c.height);
});

const diagram = (id: string, commit: string, title = id): Artifact<DiagramData> => ({
  id, sessionId: "S", type: "Diagram", status: "proposed", createdAt: id, provenance: { taskId: "t" },
  data: { kind: "sequence", commit, commitIndex: Number(commit) - 1, title, summary: "A sequence summary.", lanes: [{ id: "a", label: "A", note: null }], steps: [{ from: "a", to: "a", symbol: "run", call: "run()", what: "Runs", when: null, guard: null, phase: null, status: "existing", cite: { path: "a.ts", line: 1 }, verified: true, text: "run()" }], before: null },
 epoch: null,});

test("diagramStepTarget maps stack citations by commit coordinates and renamed paths", () => {
  const node: GraphNode = { id: "change-a", data: { kind: "change", narrativeId: "N", diffId: "D", change: ch("c1", []), files: ["new.cpp"], commit: 0, reviewed: false, threads: [], hunks: [
    { file: { path: "new.cpp", status: "renamed", binary: false, hunks: [] }, hunk: { ...hunk("f0h0", 2), newStart: 10, lines: [
      { kind: "ctx", text: "before" }, { kind: "add", text: "wanted", commit: 0, commitLine: 42, commitPath: "old.cpp" },
    ] } },
  ] } };
  const d = { ...diagram("D-seq", "sha"), data: { ...diagram("D-seq", "sha").data, commitIndex: 0 } };
  const target = diagramStepTarget([node], d, { ...d.data.steps[0]!, status: "changed", cite: { path: "old.cpp", line: 42 } });
  assert.deepEqual(target, { changeNodeId: "change-a", hunkId: "f0h0", row: { side: "new", line: 11 } });
});

test("diagramStepTarget maps single-commit adds and context by rendered new-side number", () => {
  const node: GraphNode = { id: "change-a", data: { kind: "change", narrativeId: "N", diffId: "D", change: ch("c1", []), files: ["a.cpp"], commit: null, reviewed: false, threads: [], hunks: [
    { file: { path: "a.cpp", status: "modified", binary: false, hunks: [] }, hunk: { ...hunk("f0h0", 3), newStart: 8, lines: [{ kind: "ctx", text: "context" }, { kind: "add", text: "added" }, { kind: "ctx", text: "after" }] } },
  ] } };
  const d = diagram("D-seq", "sha");
  for (const line of [8, 9, 10]) assert.deepEqual(diagramStepTarget([node], d, { ...d.data.steps[0]!, status: "changed", cite: { path: "a.cpp", line } }), { changeNodeId: "change-a", hunkId: "f0h0", row: { side: "new", line } });
});

test("diagramStepTarget rejects unverified and unmatched citations", () => {
  const d = diagram("D-seq", "sha");
  assert.equal(diagramStepTarget([], d, d.data.steps[0]!), null);
  assert.equal(diagramStepTarget([], d, { ...d.data.steps[0]!, verified: false }), null);
  const node: GraphNode = { id: "change-a", data: { kind: "change", narrativeId: "N", diffId: "D", change: ch("c1", []), files: ["a.cpp"], commit: null, reviewed: false, threads: [], hunks: [
    { file: { path: "a.cpp", status: "modified", binary: false, hunks: [] }, hunk: { ...hunk("f0h0", 1), lines: [{ kind: "ctx", text: "existing" }] } },
  ] } };
  assert.equal(diagramStepTarget([node], d, d.data.steps[0]!), null);
});

test("commit cards carry the narration's flow hint until the commit has a diagram", () => {
  const hinted = { ...stackNarrative, data: { ...stackNarrative.data, flowHints: ["how A runs", null] } };
  const hints = (artifacts: Artifact[]) => sessionGraph(state(artifacts))!.nodes.flatMap((node) => isReviewKind(node.data, "commit") ? [node.data.flowHint] : []);
  assert.deepEqual(hints([stackDiff, hinted]), ["how A runs", null]);
  assert.deepEqual(hints([stackDiff, hinted, diagram("D-1", stackDiff.data.commits[0]!.sha)]), [null, null]);
});

test("sessionGraph adds only the latest diagram for each commit in the current diff", () => {
  const old = diagram("D-old", "2"), latest = diagram("D-latest", "2");
  const legacy = { ...diagram("D-legacy", "2"), data: { ...diagram("D-legacy", "2").data, kind: "flow" } } as unknown as Artifact<DiagramData>;
  const st = state([stackDiff, stackNarrative, old, legacy, diagram("D-other", "missing"), latest]);
  const graph = sessionGraph(st)!;
  const diagrams = graph.nodes.filter((node) => isReviewKind(node.data, "diagram"));
  assert.equal(diagrams.length, 1);
  assert.equal(diagrams[0]!.id, "D-latest");
  assert.equal(isReviewKind(diagrams[0]!.data, "diagram") ? diagrams[0]!.data.diagram.id : "", "D-latest");
  assert.deepEqual(levelGraph(graph, "patch").nodes.filter((node) => isReviewKind(node.data, "diagram")), []);
  assert.equal(sessionGraph(state([stackDiff, stackNarrative, legacy]))!.nodes.some((node) => isReviewKind(node.data, "diagram")), false);
});

test("sessionGraph links each assistant message to its current diagrams", () => {
  const old = diagram("D-old", "1"), latest = diagram("D-latest", "1");
  const message = { id: "M", sessionId: "S", type: "ChatMessage", status: "proposed", createdAt: "3", provenance: { taskId: "t" }, data: { role: "assistant", text: "answer" } , epoch: null} as Artifact;
  const thread = { id: "T", sessionId: "S", type: "ChatThread", status: "proposed", createdAt: "3", provenance: { taskId: "t" }, data: { anchor: "NS", quote: null } , epoch: null} as Artifact;
  const st = state([stackDiff, stackNarrative, old, latest, thread, message]);
  st.links.push(
    { id: "reply", sessionId: "S", from: "M", to: "T", kind: "reply" },
    { id: "old-diagram", sessionId: "S", from: "D-old", to: "M", kind: "derivedFrom" },
    { id: "latest-diagram", sessionId: "S", from: "D-latest", to: "M", kind: "derivedFrom" },
  );
  const chat = sessionGraph(st)!.nodes.find((node) => node.id === "T")!;
  assert.equal(chat.data.kind, "chat");
  if (isCoreKind(chat.data, "chat")) assert.deepEqual(chat.data.diagramsByMessage?.M, ["D-latest"]);
  const conversationStart = { id: "W", sessionId: "S", type: "WorkflowStart", status: "proposed", createdAt: "0", provenance: { taskId: "t" }, data: { via: "selector", workflow: "chat", params: {}, title: "t", prompt: "t" } , epoch: null} as Artifact<WorkflowStartData>;
  const conversation = state([conversationStart, thread, message, latest], "chat");
  conversation.links.push({ id: "reply", sessionId: "S", from: "M", to: "T", kind: "reply" }, { id: "diagram", sessionId: "S", from: "D-latest", to: "M", kind: "derivedFrom" });
  const root = sessionGraph(conversation)!.nodes[0]!;
  assert.equal(root.data.kind, "conversation");
  if (root.data.kind === "conversation") assert.equal(root.data.diagramsByMessage, undefined);
});

test("stackLayout puts a diagram above its lane and shifts aligned cards down", () => {
  const graph = narrativeGraph(stackNarrative, stackDiff, [stackDiff]);
  const d = diagram("diagram-2", "2");
  graph.nodes.push({ id: d.id, data: { kind: "diagram", diagram: d } });
  const sized = graph.nodes.map((node) => ({ id: node.id, data: node.data, anchors: node.anchors ?? [], ...estimateSize(node.data, "concept") }));
  const pos = stackLayout(sized, graph.edges);
  const box = (id: string) => ({ p: pos.get(id)!, h: sized.find((node) => node.id === id)!.height });
  const diagramBox = box("diagram-2"), card2 = box("NS#commit-1"), card1 = box("NS#commit-0");
  assert.ok(diagramBox.p.y + diagramBox.h + 24 <= card2.p.y);
  assert.equal(card1.p.y, card2.p.y);
});

test("stackLayout shifts wide diagrams right so they do not overlap", () => {
  const graph = narrativeGraph(stackNarrative, stackDiff, [stackDiff]);
  for (const d of [diagram("diagram-1", "1"), diagram("diagram-2", "2")]) {
    const wide = { ...d, data: { ...d.data, lanes: Array.from({ length: 8 }, (_, i) => ({ id: `l${i}`, label: `Lane ${i}`, note: null })) } };
    graph.nodes.push({ id: wide.id, data: { kind: "diagram", diagram: wide } });
  }
  const sized = graph.nodes.map((node) => ({ id: node.id, data: node.data, anchors: node.anchors ?? [], ...estimateSize(node.data, "concept") }));
  const pos = stackLayout(sized, graph.edges);
  const first = sized.find((node) => node.id === "diagram-1")!, second = sized.find((node) => node.id === "diagram-2")!;
  assert.ok(pos.get("diagram-1")!.x + first.width <= pos.get("diagram-2")!.x);
});

test("diagram estimates grow with lanes and steps", () => {
  const base = diagram("D", "1");
  const data = { kind: "diagram" as const, diagram: base };
  const larger = { ...base, data: { ...base.data, lanes: Array.from({ length: 3 }, (_, i) => ({ id: `${i}`, label: `${i}`, note: null })), steps: Array.from({ length: 4 }, (_, i) => ({ ...base.data.steps[0]!, phase: i < 2 ? "one" : "two" })) } };
  assert.ok(estimateSize({ ...data, diagram: larger }, "concept").width > estimateSize(data, "concept").width);
  assert.ok(estimateSize({ ...data, diagram: larger }, "concept").height > estimateSize(data, "concept").height);
});

test("single-commit layout ranks diagram after summary and before changes", () => {
  const d = diagram("diagram-1", "1");
  const graph = narrativeGraph(narrative("N"), diff, [diff]);
  const nodes = [...graph.nodes, { id: d.id, data: { kind: "diagram" as const, diagram: d } }];
  const changes = graph.nodes.filter((node) => isReviewKind(node.data, "change") && graph.edges.every((edge) => edge.target !== node.id));
  const layoutEdges = diagramLayoutEdges(nodes, graph.edges);
  const positions = layout(nodes.map((node) => ({ id: node.id, ...estimateSize(node.data, "concept") })), layoutEdges);
  assert.ok(positions.get("N")!.y < positions.get(d.id)!.y);
  assert.ok(changes.every((node) => positions.get(d.id)!.y < positions.get(node.id)!.y));
});

test("estimateSize scales change and finding dimensions", () => {
  const g = narrativeGraph(narrative("N"), diff, [diff]);
  const c2 = g.nodes[2].data;
  const base = estimateSize(c2, "code");
  assert.deepEqual(estimateSize(c2, "code", 1.5), { width: base.width * 1.5, height: base.height * 1.5 });
  const finding = { kind: "finding" as const, findingId: "F", ai: true, diffId: "D", hunks: [], anchor: "D#f0h0", quote: "l0", category: "tests" as const, severity: "low" as const, title: "T", body: "body", thread: null, decision: null, comment: null, postedTo: null, status: "open" as const, outdated: false, verdict: null, fromEpoch: null, collapsedByDefault: false };
  const findingBase = estimateSize(finding, "code");
  assert.deepEqual(estimateSize(finding, "code", 1.5), { width: SATELLITE_WIDTH * 1.5, height: findingBase.height * 1.5 });
});

test("layout: dependents below dependencies, no overlaps, deterministic", () => {
  const g = narrativeGraph(narrative("N"), diff, [diff]);
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
   epoch: null};
  const st = state([diff, narrative("N"), spec]);
  st.links = [{ id: "l1", sessionId: "S", from: "R", to: "N#c2", kind: "supports" }];
  const g = sessionGraph(st)!;
  const r = g.nodes.find((n) => n.id === "R")!;
  assert.equal(r.data.kind, "spec");
  assert.deepEqual(r.anchors, ["N#c2"]);
  assert.ok(g.edges.some((e) => e.source === "R" && e.target === "N#c2"));
  assert.equal(sessionGraph(state([diff])), null);
});

test("sessionGraph hosts anchored Phabricator comments and their chat thread", () => {
  const remote = { id: "PC", sessionId: "S", type: "PhabComment", status: "verified" as const, createdAt: "3", provenance: { taskId: "runtime" }, data: { revision: 1, phid: "PHID-XCMT-1", version: 1, author: "alice", bot: false, body: "remote", path: "a.cpp", line: 1, length: 1, diffId: 7, isNewFile: true, own: false, done: false, txId: 1, dateCreated: 1 } , epoch: null};
  const sync = { id: "PS", sessionId: "S", type: "PhabSync", status: "verified" as const, createdAt: "3", provenance: { taskId: "runtime" }, data: { revision: 1, matchingDiffId: 7, latestDiffId: 7, localDiff: "D" } , epoch: null};
  const thread = { id: "T-PC", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "turn" }, data: { anchor: "PC" } , epoch: null};
  const msg = { id: "M-PC", sessionId: "S", type: "ChatMessage", status: "verified" as const, createdAt: "5", provenance: { taskId: "turn" }, data: { role: "assistant" as const, text: "answer" } , epoch: null};
  const st = state([diff, narrative("N"), sync, remote, thread, msg]);
  st.links = [{ id: "reply-pc", sessionId: "S", from: "M-PC", to: "T-PC", kind: "reply" }, { id: "phab-reply", sessionId: "S", from: "T-PC", to: "PC", kind: "about" }];
  const g = sessionGraph(st)!;
  const node = g.nodes.find((n) => n.id === "PC");
  assert.equal(node?.data.kind, "phab");
  if (isReviewKind(node?.data, "phab")) assert.deepEqual({ anchors: node.anchors, fromEpoch: node.data.fromEpoch, threadId: node.data.thread?.threadId, message: node.data.thread?.messages[0]?.id }, { anchors: ["N#c1"], fromEpoch: null, threadId: "T-PC", message: "M-PC" });
  assert.ok(!g.nodes.some((n) => n.id === "T-PC"));
});

test("sessionGraph exposes remote comments in summary data and carries root done state", () => {
  const withRevision = { ...diff, data: { ...diff.data, commits: [{ sha: "1", subject: "Bug 1", body: "Differential Revision: https://phab.example.com/D1" }] } };
  const root = { id: "PC", sessionId: "S", type: "PhabComment", status: "verified" as const, createdAt: "3", provenance: { taskId: "runtime" }, data: { revision: 1, phid: "PHID-XCMT-1", version: 1, author: "alice", bot: false, body: "inline", path: "a.cpp", line: 1, length: 1, diffId: 7, isNewFile: true, own: false, done: true, txId: 1, dateCreated: 1 } , epoch: null};
  const general = { ...root, id: "PG", data: { ...root.data, phid: "PHID-XCMT-2", body: "general", path: undefined, line: undefined, diffId: undefined, isNewFile: undefined, done: false } };
  const outdated = { ...root, id: "PO", data: { ...root.data, phid: "PHID-XCMT-3", body: "outdated", path: "b.h", diffId: 9 } };
  const previousSync = { id: "PS1", sessionId: "S", type: "PhabSync", status: "verified" as const, createdAt: "3", provenance: { taskId: "runtime" }, data: { revision: 1, matchingDiffId: 9, latestDiffId: 9, localDiff: "D" } , epoch: null};
  const latestSync = { id: "PS2", sessionId: "S", type: "PhabSync", status: "verified" as const, createdAt: "4", provenance: { taskId: "runtime" }, data: { revision: 1, matchingDiffId: 7, latestDiffId: 9, localDiff: "D2" } , epoch: null};
  const nextDiff = { ...withRevision, id: "D2", createdAt: "4" };
  const nextNarrative = { ...narrative("N"), id: "N2", createdAt: "5", data: { ...narrative("N").data, diffId: "D2", changes: [ch("c1", ["f0h0"])] } };
  const st = state([withRevision, previousSync, root, general, outdated, latestSync, nextDiff, nextNarrative]);
  const graph = sessionGraph(st)!;
  const summary = graph.nodes.find((node) => node.id === "N2")!.data;
  assert.equal(summary.kind, "summary");
  if (isReviewKind(summary, "summary")) {
    assert.deepEqual(summary.phabGeneral.map((item) => item.id), ["PG"]);
    assert.deepEqual(summary.phabUnanchored.map((group) => [group.diffId, group.oldSide, group.outdatedEpoch, group.comments.map((item) => item.id)]), [[9, false, 1, ["PO"]]]);
  }
  const thread = graph.nodes.find((node) => node.id === "PC");
  assert.equal(thread?.data.kind, "phab");
  if (isReviewKind(thread?.data, "phab")) assert.equal(thread.data.done, true);
});

test("sessionGraph exposes unenabled MCP requests per thread", () => {
  const thread = { id: "T", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "N#c1" } , epoch: null};
  const request = { id: "REQ", sessionId: "S", type: "McpServerRequest", status: "proposed" as const, createdAt: "5", provenance: { taskId: "t" }, data: { server: "firefox-devtools" } , epoch: null};
  const st = state([diff, narrative("N"), thread, request]);
  st.links = [{ id: "about", sessionId: "S", from: "REQ", to: "T", kind: "about" }];
  const hosted = sessionGraph(st)!.nodes.find((node) => node.id === "N#c1")!.data;
  assert.equal(hosted.kind, "change");
  if (isReviewKind(hosted, "change")) assert.deepEqual(hosted.threads[0].mcpRequests, ["firefox-devtools"]);

  const enabled = { id: "EN", sessionId: "S", type: "McpServerEnabled", status: "verified" as const, createdAt: "6", provenance: { taskId: "user" }, data: { server: "firefox-devtools" } , epoch: null};
  st.artifacts.push(enabled);
  st.links.push({ id: "enabled-about", sessionId: "S", from: "EN", to: "T", kind: "about" });
  const afterEnable = sessionGraph(st)!.nodes.find((node) => node.id === "N#c1")!.data;
  if (isReviewKind(afterEnable, "change")) assert.deepEqual(afterEnable.threads[0].mcpRequests, []);

  st.artifacts.push({ ...thread, id: "T2", data: { anchor: "N#c2" } }, { ...request, id: "REQ2", data: { server: "firefox-devtools" } });
  st.links.push({ id: "about2", sessionId: "S", from: "REQ2", to: "T2", kind: "about" });
  const otherThread = sessionGraph(st)!.nodes.find((node) => node.id === "N#c2")!.data;
  if (isReviewKind(otherThread, "change")) assert.deepEqual(otherThread.threads[0].mcpRequests, ["firefox-devtools"]);
});

test("sessionGraph ignores spec refs of older narratives", () => {
  const spec = { id: "R", sessionId: "S", type: "SpecReference", status: "verified" as const, createdAt: "3", provenance: { taskId: "t" }, data: { url: "u", resolved: null, geckoRefs: [] } , epoch: null};
  const st = state([diff, narrative("N1"), narrative("N2"), spec]);
  st.links = [{ id: "l1", sessionId: "S", from: "R", to: "N1#c2", kind: "supports" }];
  assert.ok(!sessionGraph(st)!.nodes.some((n) => n.id === "R"));
});

test("summary spec status requires a succeeded resolver for this narrative", () => {
  const refs = [
    { id: "RC", sessionId: "S", type: "SpecReference", status: "verified" as const, createdAt: "3", provenance: { taskId: "t" }, data: { url: "code", origin: "code" as const, resolved: null, geckoRefs: [] } , epoch: null},
    { id: "RI", sessionId: "S", type: "SpecReference", status: "verified" as const, createdAt: "3", provenance: { taskId: "t" }, data: { url: "llm", origin: "llm" as const, resolved: null, geckoRefs: [] } , epoch: null},
    { id: "RP", sessionId: "S", type: "SpecReference", status: "proposed" as const, createdAt: "3", provenance: { taskId: "t" }, data: { url: "proposed", origin: "code" as const, resolved: null, geckoRefs: [] } , epoch: null},
  ];
  const st = state([diff, narrative("N"), ...refs]);
  st.links = refs.map((r, i) => ({ id: `l${i}`, sessionId: "S", from: r.id, to: `N#c${i + 1}`, kind: "supports" as const }));
  const summary = () => sessionGraph(st)!.nodes[0].data;
  let data = summary();
  assert.equal(data.kind, "summary");
  if (isReviewKind(data, "summary")) assert.equal(data.specStatus, null);

  st.tasks = [{ id: "resolve", sessionId: "S", kind: "resolveSpecRefs", status: "succeeded", input: { narrativeId: "N" }, output: null, error: null, createdAt: "4", updatedAt: "4", epoch: null}];
  data = summary();
  if (isReviewKind(data, "summary")) assert.deepEqual(data.specStatus, { code: 1, inferred: 1, unverified: 1 });

  st.tasks = [{ ...st.tasks[0]!, input: { narrativeId: "other" } }];
  data = summary();
  if (isReviewKind(data, "summary")) assert.equal(data.specStatus, null);
  st.tasks = [{ ...st.tasks[0]!, input: { narrativeId: "N" } }];
  st.artifacts = [diff, narrative("N")];
  st.links = [];
  data = summary();
  if (isReviewKind(data, "summary")) assert.deepEqual(data.specStatus, { code: 0, inferred: 0, unverified: 0 });
});

test("anchorNodeId maps change refs and hunk refs to change nodes", () => {
  const n = narrative("N");
  assert.equal(anchorNodeId("N#c2", "N", n.data, "D"), "N#c2");
  assert.equal(anchorNodeId("D#f1h0", "N", n.data, "D"), "N#c2");
  assert.equal(anchorNodeId("OLD#c1", "N", n.data, "D"), null);
  assert.equal(anchorNodeId("D#f9h9", "N", n.data, "D"), null);
});

test("anchorNodeId maps a commit ref only when its commit card is present", () => {
  const n = narrative("N");
  assert.equal(anchorNodeId("N#commit-1", "N", n.data, "D", new Set(["N#commit-1"])), "N#commit-1");
  assert.equal(anchorNodeId("N#commit-1", "N", n.data, "D", new Set()), null);
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
  const oldThread = { id: "T-old", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "N1#c1" } , epoch: null};
  const g = sessionGraph(state([diff, narrative("N1"), narrative("N2"), oldThread]))!;
  assert.ok(!g.nodes.some((n) => n.id === "T-old"));
});

test("sessionGraph skips a chat anchored to a message of a hidden chat", () => {
  const hidden = { id: "T1", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "N1#c1" } , epoch: null};
  const message = { id: "M1", sessionId: "S", type: "ChatMessage", status: "verified" as const, createdAt: "5", provenance: { taskId: "t" }, data: { role: "assistant" as const, text: "answer" } , epoch: null};
  const nested = { id: "T2", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "6", provenance: { taskId: "t" }, data: { anchor: "M1" } , epoch: null};
  const st = state([diff, narrative("N1"), narrative("N2"), hidden, message, nested]);
  st.links = [{ id: "reply", sessionId: "S", from: "M1", to: "T1", kind: "reply" }];
  const g = sessionGraph(st)!;
  assert.ok(!g.nodes.some((n) => n.id === "T1" || n.id === "T2"));
});

test("closeGraph drops closed chats, their replies and diagrams, and lists closed chats per host", () => {
  const onChange = { id: "T1", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0" } , epoch: null};
  const onSummary = { id: "T2", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "5", provenance: { taskId: "t" }, data: { anchor: "N" } , epoch: null};
  const message = { id: "M2", sessionId: "S", type: "ChatMessage", status: "verified" as const, createdAt: "6", provenance: { taskId: "t" }, data: { role: "assistant" as const, text: "answer" } , epoch: null};
  const reply = { id: "T3", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "7", provenance: { taskId: "t" }, data: { anchor: "M2" } , epoch: null};
  const st = state([diff, narrative("N"), onChange, onSummary, message, reply]);
  st.links = [{ id: "reply", sessionId: "S", from: "M2", to: "T2", kind: "reply" }];
  const { graph, closedOn } = closeGraph(sessionGraph(st)!, new Set(["T1", "T2"]));
  const change = graph.nodes.find((node) => node.id === "N#c1")!.data;
  assert.deepEqual(isReviewKind(change, "change") ? change.threads : null, []);
  assert.ok(!graph.nodes.some((node) => node.id === "T2" || node.id === "T3"));
  assert.ok(!graph.edges.some((edge) => edge.source === "T2" || edge.source === "T3"));
  assert.deepEqual(Object.fromEntries(closedOn), { "N#c1": [{ id: "T1", kind: "chat" }], N: [{ id: "T2", kind: "chat" }] });
  const diagrams = closeGraph(sessionGraph(state([stackDiff, stackNarrative, diagram("D-1", "2")]))!, new Set(["D-1"])).graph;
  assert.ok(!diagrams.nodes.some((node) => isReviewKind(node.data, "diagram")));
});

test("sessionGraph anchors a chat on a note", () => {
  const start = { id: "W", sessionId: "S", type: "WorkflowStart", status: "verified" as const, createdAt: "1", provenance: { taskId: "t" }, data: { workflow: "review", prompt: "/review" } , epoch: null};
  const note = { id: "NOTE", sessionId: "S", type: "Note", status: "proposed" as const, createdAt: "2", provenance: { taskId: "t" }, data: { body: "check this" } , epoch: null};
  const thread = { id: "T", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "3", provenance: { taskId: "t" }, data: { anchor: "NOTE" } , epoch: null};
  const g = sessionGraph(state([diff, narrative("N"), start, note, thread] as Artifact[]))!;
  assert.deepEqual(g.nodes.find((node) => node.id === "T")?.anchors, ["NOTE"]);
  assert.ok(g.edges.some((edge) => edge.source === "T" && edge.target === "NOTE"));
});

test("sessionGraph attaches revisions to hosted thread messages", () => {
  const thread = { id: "T", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0" } , epoch: null};
  const msg = { id: "M", sessionId: "S", type: "ChatMessage", status: "verified" as const, createdAt: "5", provenance: { taskId: "t" }, data: { role: "assistant" as const, text: "Stub answer." } , epoch: null};
  const revision = { id: "REV", sessionId: "S", type: "Revision", status: "proposed" as const, createdAt: "6", provenance: { taskId: "t" }, data: { quote: "Stub answer.", correction: "Corrected stub answer." } , epoch: null};
  const st = state([diff, narrative("N"), thread, msg, revision]);
  st.links = [
    { id: "reply", sessionId: "S", from: "M", to: "T", kind: "reply" },
    { id: "revises", sessionId: "S", from: "REV", to: "M", kind: "revises" },
  ];
  const change = sessionGraph(st)!.nodes.find((node) => node.id === "N#c1")!.data;
  assert.equal(change.kind, "change");
  if (isReviewKind(change, "change")) assert.deepEqual(change.threads[0].revisions.M, [revision.data]);
});

test("sessionGraph hosts change threads and drafts in their change cards", () => {
  const thread = { id: "T", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0", quote: "l1", lines: { path: "a.cpp", side: "new" as const, start: 1, end: 1 } } , epoch: null};
  const msg = { id: "M", sessionId: "S", type: "ChatMessage", status: "verified" as const, createdAt: "5", provenance: { taskId: "t" }, data: { role: "user", text: "q" } , epoch: null};
  const st = state([diff, narrative("N"), thread, msg]);
  st.links = [{ id: "l", sessionId: "S", from: "M", to: "T", kind: "reply" }];
  const g = sessionGraph(st, [{ id: "draft-1", anchor: "N#c3" }])!;
  const change = g.nodes.find((x) => x.id === "N#c1")!;
  assert.equal(change.data.kind, "change");
  if (isReviewKind(change.data, "change")) {
    assert.deepEqual(change.data.threads.map(({ threadId }) => threadId), ["T"]);
    assert.equal(change.data.threads[0].messages.length, 1);
    assert.deepEqual(change.data.threads[0].lines, thread.data.lines);
  }
  assert.ok(!g.nodes.some((x) => x.id === "T" || x.id === "draft-1"));
  const draftHost = g.nodes.find((x) => x.id === "N#c3")!;
  assert.equal(draftHost.data.kind, "change");
  if (isReviewKind(draftHost.data, "change")) assert.deepEqual(draftHost.data.threads.map(({ draftId }) => draftId), ["draft-1"]);
});

test("change chats are hosted while other chats can anchor to specs, chat messages, and summary", () => {
  const spec = { id: "R", sessionId: "S", type: "SpecReference", status: "verified" as const, createdAt: "3", provenance: { taskId: "t" }, data: { url: "u", resolved: null, geckoRefs: [] } , epoch: null};
  const first = { id: "T1", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "N#c1" } , epoch: null};
  const message = { id: "M1", sessionId: "S", type: "ChatMessage", status: "verified" as const, createdAt: "5", provenance: { taskId: "t" }, data: { role: "assistant" as const, text: "answer" } , epoch: null};
  const onSpec = { id: "T2", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "6", provenance: { taskId: "t" }, data: { anchor: "R" } , epoch: null};
  const onChat = { id: "T3", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "7", provenance: { taskId: "t" }, data: { anchor: "M1" } , epoch: null};
  const onSummary = { id: "T4", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "8", provenance: { taskId: "t" }, data: { anchor: "N" } , epoch: null};
  const st = state([diff, narrative("N"), spec, first, message, onSpec, onChat, onSummary]);
  st.links = [
    { id: "support", sessionId: "S", from: "R", to: "N#c1", kind: "supports" },
    { id: "reply", sessionId: "S", from: "M1", to: "T1", kind: "reply" },
  ];
  const g = sessionGraph(st)!;
  assert.deepEqual(g.nodes.find((n) => n.id === "T2")?.anchors, ["R"]);
  assert.ok(!g.nodes.some((n) => n.id === "T1" || n.id === "T3"));
  const change = g.nodes.find((n) => n.id === "N#c1")!.data;
  if (isReviewKind(change, "change")) assert.deepEqual(change.threads.map((thread) => thread.threadId), ["T1", "T3"]);
  assert.deepEqual(g.nodes.find((n) => n.id === "T4")?.anchors, ["N"]);
});

test("sessionGraph adds findings and skips findings from older diffs", () => {
  const findingData: ReviewFindingData = { anchor: "D#f0h0", quote: "l0", lines: { path: "a.cpp", side: "new", start: 1, end: 1 }, category: "correctness", severity: "high", title: "Finding", body: "Body" };
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: findingData , epoch: null};
  const stale = { ...finding, id: "F-old", data: { ...findingData, anchor: "OLD#f0h0" } };
  const g = sessionGraph(state([diff, narrative("N"), finding, stale]))!;
  const node = g.nodes.find((n) => n.id === "F")!;
  assert.equal(node.data.kind, "finding");
  if (isReviewKind(node.data, "finding")) assert.deepEqual({ quote: node.data.quote, lines: node.data.lines, severity: node.data.severity }, { quote: "l0", lines: findingData.lines, severity: "high" });
  assert.deepEqual(node.anchors, ["N#c1"]);
  assert.ok(g.edges.some((e) => e.source === "F" && e.target === "N#c1"));
  assert.ok(!g.nodes.some((n) => n.id === "F-old"));
});

test("sessionGraph includes carried findings at their new anchor and outdated findings at the summary", () => {
  const d1 = { ...diff, id: "D1", createdAt: "1" };
  const n1 = { ...narrative("N1"), data: { ...narrative("N1").data, diffId: "D1" } };
  const d2 = { ...diff, id: "D2", createdAt: "3" };
  const n2 = { ...narrative("N2"), data: { ...narrative("N2").data, diffId: "D2", previous: "N1" } };
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "2", provenance: { taskId: "review" }, data: { anchor: "D1#f0h0", quote: "l0", lines: { path: "a.cpp", side: "new" as const, start: 1, end: 1 }, category: "correctness" as const, severity: "high" as const, title: "Finding", body: "Body" } , epoch: null};
  const carry = (id: string, hunkId: string | null) => ({ id, sessionId: "S", type: "FindingCarry", status: "verified" as const, createdAt: id, provenance: { taskId: "carry" }, data: { finding: "F", toDiff: "D2", hunkId, ...(hunkId ? { lines: { path: "a.cpp", side: "new" as const, start: 12, end: 12 } } : {}) } , epoch: null});
  const stateWithCarry = (hunkId: string | null) => {
    const carried = carry(`C-${hunkId}`, hunkId);
    const st = state([d1, n1, finding, d2, n2, carried]);
    st.links = [
      { id: "f-n1", sessionId: "S", from: "F", to: "N1", kind: "derivedFrom" },
      { id: "f-d1", sessionId: "S", from: "F", to: "D1#f0h0", kind: "about" },
      { id: "carry-f", sessionId: "S", from: carried.id, to: "F", kind: "about" },
    ];
    return st;
  };
  const moved = sessionGraph(stateWithCarry("f0h0"))!;
  const summary = moved.nodes.find((item) => item.id === "N2")!.data;
  if (isReviewKind(summary, "summary")) assert.equal(summary.sinceEpoch, 1);
  const node = moved.nodes.find((item) => item.id === "F")!;
  assert.deepEqual(node.anchors, ["N2#c1"]);
  if (isReviewKind(node.data, "finding")) {
    assert.equal(node.data.fromEpoch, 1);
    assert.equal(node.data.quote, "l0");
    assert.deepEqual(node.data.lines, { path: "a.cpp", side: "new", start: 12, end: 12 });
  }
  const outdated = sessionGraph(stateWithCarry(null))!;
  const stale = outdated.nodes.find((item) => item.id === "F")!;
  assert.deepEqual(stale.anchors, ["N2"]);
  if (isReviewKind(stale.data, "finding")) {
    assert.equal(stale.data.outdated, true);
    assert.equal(stale.data.quote, undefined);
    assert.equal(stale.data.collapsedByDefault, true);
  }
  assert.deepEqual(visibleGraph(outdated, new Set(["F"])).nodes.map((item) => item.id).includes("F"), true);
});

test("sessionGraph shows only current findings and marks addressed carries collapsed", () => {
  const d1 = { ...diff, id: "D1", createdAt: "1" };
  const n1 = { ...narrative("N1"), data: { ...narrative("N1").data, diffId: "D1" } };
  const d2 = { ...diff, id: "D2", createdAt: "3" };
  const n2 = { ...narrative("N2"), data: { ...narrative("N2").data, diffId: "D2" } };
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "2", provenance: { taskId: "review" }, data: { anchor: "D1#f0h0", category: "correctness" as const, severity: "high" as const, title: "Finding", body: "Body" } , epoch: null};
  const carry = { id: "C", sessionId: "S", type: "FindingCarry", status: "verified" as const, createdAt: "4", provenance: { taskId: "carry" }, data: { finding: "F", toDiff: "D2", hunkId: "f0h0" } , epoch: null};
  const verdict = { id: "V", sessionId: "S", type: "FindingVerdict", status: "proposed" as const, createdAt: "5", provenance: { taskId: "review" }, data: { finding: "F", verdict: "addressed" as const, reason: "Fixed" } , epoch: null};
  const st = state([d1, n1, finding, d2, n2, carry, verdict]);
  st.links = [
    { id: "f-n1", sessionId: "S", from: "F", to: "N1", kind: "derivedFrom" },
    { id: "f-d1", sessionId: "S", from: "F", to: "D1#f0h0", kind: "about" },
    { id: "carry-f", sessionId: "S", from: "C", to: "F", kind: "about" },
    { id: "verdict-f", sessionId: "S", from: "V", to: "F", kind: "about" },
  ];
  const g = sessionGraph(st)!;
  const node = g.nodes.find((item) => item.id === "F")!;
  assert.ok(!g.nodes.some((item) => item.id === "not-carried"));
  if (isReviewKind(node.data, "finding")) {
    assert.equal(node.data.status, "addressed");
    assert.equal(node.data.collapsedByDefault, true);
    assert.deepEqual(node.data.verdict, { verdict: "addressed", reason: "Fixed" });
  }
  const summary = g.nodes.find((item) => item.id === "N2")!.data;
  if (isReviewKind(summary, "summary")) assert.equal(summary.sinceEpoch, null);
});

test("sessionGraph finding node includes latest decision and comment", () => {
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0", category: "tests", severity: "low", title: "Finding", body: "Body" } , epoch: null};
  const decision = { id: "DEC", sessionId: "S", type: "FindingDecision", status: "verified" as const, createdAt: "5", provenance: { taskId: "user" }, data: { finding: "F", decision: "accepted" } , epoch: null};
  const comment = { id: "C", sessionId: "S", type: "ReviewComment", status: "verified" as const, createdAt: "6", provenance: { taskId: "user" }, data: { finding: "F", body: "Use a strong ref." } , epoch: null};
  const st = state([diff, narrative("N"), finding, decision, comment]);
  st.links = [
    { id: "decision-about", sessionId: "S", from: "DEC", to: "F", kind: "about" },
    { id: "comment-about", sessionId: "S", from: "C", to: "F", kind: "about" },
    { id: "finding-derived", sessionId: "S", from: "F", to: "N", kind: "derivedFrom" },
  ];
  const node = sessionGraph(st)!.nodes.find((n) => n.id === "F")!.data;
  assert.equal(node.kind, "finding");
  if (isReviewKind(node, "finding")) {
    assert.equal(node.decision, "accepted");
    assert.deepEqual(node.comment, { id: "C", body: "Use a strong ref.", status: "verified" });
    assert.equal(node.postedTo, null);
  }
});

test("sessionGraph finding exposes posted revision for its latest comment", () => {
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0", category: "tests", severity: "low", title: "Finding", body: "Body" } , epoch: null};
  const comment = { id: "C", sessionId: "S", type: "ReviewComment", status: "verified" as const, createdAt: "5", provenance: { taskId: "user" }, data: { finding: "F", body: "Ready" } , epoch: null};
  const posted = { id: "P", sessionId: "S", type: "PostedComment", status: "verified" as const, createdAt: "6", provenance: { taskId: "runtime" }, data: { comment: "C", revision: 12, diff: 8, inlineId: 77 } , epoch: null};
  const st = state([diff, narrative("N"), finding, comment, posted]);
  st.links = [{ id: "comment-about", sessionId: "S", from: "C", to: "F", kind: "about" }, { id: "finding-derived", sessionId: "S", from: "F", to: "N", kind: "derivedFrom" }];
  const node = sessionGraph(st)!.nodes.find((n) => n.id === "F")!.data;
  assert.equal(node.kind, "finding");
  if (isReviewKind(node, "finding")) assert.equal(node.postedTo, 12);
});

test("sessionGraph finding without status artifacts has null decision and comment", () => {
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0", category: "tests", severity: "low", title: "Finding", body: "Body" } , epoch: null};
  const node = sessionGraph(state([diff, narrative("N"), finding]))!.nodes.find((n) => n.id === "F")!.data;
  assert.equal(node.kind, "finding");
  if (isReviewKind(node, "finding")) {
    assert.equal(node.decision, null);
    assert.equal(node.comment, null);
  }
});

test("sessionGraph finding reflects dismissal and latest decision wins", () => {
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: { anchor: "D#f0h0", category: "tests", severity: "low", title: "Finding", body: "Body" } , epoch: null};
  const accepted = { id: "DEC1", sessionId: "S", type: "FindingDecision", status: "verified" as const, createdAt: "5", provenance: { taskId: "user" }, data: { finding: "F", decision: "accepted" } , epoch: null};
  const dismissed = { ...accepted, id: "DEC2", createdAt: "6", data: { finding: "F", decision: "dismissed" } };
  const st = state([diff, narrative("N"), finding, accepted, dismissed]);
  st.links = [...[accepted, dismissed].map((a) => ({ id: `${a.id}-about`, sessionId: "S", from: a.id, to: "F", kind: "about" as const })), { id: "finding-derived", sessionId: "S", from: "F", to: "N", kind: "derivedFrom" }];
  const node = sessionGraph(st)!.nodes.find((n) => n.id === "F")!.data;
  assert.equal(node.kind, "finding");
  if (isReviewKind(node, "finding")) assert.equal(node.decision, "dismissed");
});

test("a finding's thread lives in the finding node, and chats on its messages anchor to the finding", () => {
  const findingData: ReviewFindingData = { anchor: "D#f0h0", category: "tests", severity: "low", title: "Finding", body: "Body" };
  const finding = { id: "F", sessionId: "S", type: "ReviewFinding", status: "proposed" as const, createdAt: "4", provenance: { taskId: "t" }, data: findingData , epoch: null};
  const thread = { id: "T", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "5", provenance: { taskId: "turn" }, data: { anchor: "F" } , epoch: null};
  const msg = { id: "M", sessionId: "S", type: "ChatMessage", status: "verified" as const, createdAt: "6", provenance: { taskId: "turn" }, data: { role: "assistant" as const, text: "answer" } , epoch: null};
  const onMessage = { id: "T2", sessionId: "S", type: "ChatThread", status: "verified" as const, createdAt: "7", provenance: { taskId: "t2" }, data: { anchor: "M" } , epoch: null};
  const st = state([diff, narrative("N"), finding, thread, msg, onMessage]);
  st.links = [{ id: "reply", sessionId: "S", from: "M", to: "T", kind: "reply" }, { id: "finding-derived", sessionId: "S", from: "F", to: "N", kind: "derivedFrom" }];
  const g = sessionGraph(st)!;
  assert.ok(!g.nodes.some((n) => n.id === "T"));
  const node = g.nodes.find((n) => n.id === "F")!.data;
  assert.equal(node.kind, "finding");
  if (isReviewKind(node, "finding")) assert.deepEqual({ threadId: node.thread?.threadId, taskId: node.thread?.taskId, messages: node.thread?.messages.map((m) => m.id) }, { threadId: "T", taskId: "turn", messages: ["M"] });
  assert.deepEqual(g.nodes.find((n) => n.id === "T2")?.anchors, ["F"]);
});

test("visibleGraph hides collapsed quoted findings except dismissed cards", () => {
  const finding = (id: string, quote?: string, decision: "accepted" | "dismissed" | null = null): GraphNode => ({ id, data: { kind: "finding", foldsToQuote: decision !== "dismissed", findingId: id, ai: true, diffId: "D", hunks: [], anchor: "D#f0h0", ...(quote ? { quote } : {}), category: "tests", severity: "low", title: id, body: "body", thread: null, decision, comment: null, postedTo: null, status: decision ?? "open", outdated: false, verdict: null, fromEpoch: null, collapsedByDefault: false } });
  const g = { nodes: [finding("quoted", "l0"), finding("plain"), finding("dismissed", "l0", "dismissed")], edges: [{ id: "q", source: "quoted", target: "N#c1" }, { id: "p", source: "plain", target: "N#c1" }, { id: "d", source: "dismissed", target: "N#c1" }] };
  const visible = visibleGraph(g, new Set(["quoted", "plain", "dismissed"]));
  assert.deepEqual(visible.nodes.map((n) => n.id), ["plain", "dismissed"]);
  assert.deepEqual(visible.edges.map((e) => e.id), ["p", "d"]);
});

test("estimateSize gives findings the satellite width", () => {
  const data = { kind: "finding" as const, findingId: "F", ai: true, diffId: "D", hunks: [], anchor: "D#f0h0", quote: "l0", category: "tests" as const, severity: "low" as const, title: "T", body: "body", thread: null, decision: null, comment: null, postedTo: null, status: "open" as const, outdated: false, verdict: null, fromEpoch: null, collapsedByDefault: false };
  assert.deepEqual(estimateSize(data, "concept"), { width: SATELLITE_WIDTH, height: 110 + 20 });
});

test("layerGraph hides spec cards with spec checks, AI findings, or Phabricator comments, and what hangs off them", () => {
  const node = (id: string, data: object, anchors?: string[]) => ({ id, ...(anchors ? { anchors } : {}), data } as unknown as GraphNode);
  const g = { nodes: [
    node("N", { kind: "summary", phabGeneral: ["general"], phabUnanchored: ["unanchored"] }),
    node("N#c1", { kind: "change" }),
    node("R", { kind: "spec" }, ["N#c1"]),
    node("T", { kind: "chat" }, ["R"]),
    node("F-ai", { kind: "finding", ai: true }, ["N#c1"]),
    node("F-step", { kind: "finding", ai: false }, ["N#c1"]),
    node("P", { kind: "phab" }, ["N#c1"]),
  ], edges: [{ id: "R->N#c1", source: "R", target: "N#c1" }, { id: "T->R", source: "T", target: "R" }, { id: "P->N#c1", source: "P", target: "N#c1" }] };
  const ids = (hidden: string[]) => layerGraph(g, new Set(hidden as ("spec" | "review" | "phab")[])).nodes.map((n) => n.id);
  assert.equal(layerGraph(g, new Set()), g);
  assert.deepEqual(ids(["spec"]), ["N", "N#c1", "F-ai", "P"]);
  assert.deepEqual(ids(["review"]), ["N", "N#c1", "R", "T", "F-step", "P"]);
  const phab = layerGraph(g, new Set(["phab"]));
  assert.deepEqual(phab.nodes.map((n) => n.id), ["N", "N#c1", "R", "T", "F-ai", "F-step"]);
  assert.deepEqual(phab.nodes[0]!.data, { kind: "summary", phabGeneral: [], phabUnanchored: [] });
  assert.deepEqual(layerGraph(g, new Set(["spec"])).edges.map((e) => e.id), ["P->N#c1"]);
});
test("a review session shows notes as note nodes", () => {
  const start = { id: "W", sessionId: "S", type: "WorkflowStart", status: "proposed", createdAt: "0", provenance: { taskId: "t" }, data: { via: "selector", workflow: "chat", params: {}, title: "Chat", prompt: "Explain" } , epoch: null} as Artifact<WorkflowStartData>;
  const note = { id: "N1", sessionId: "S", type: "Note", status: "verified", createdAt: "1", provenance: { taskId: "user" }, data: { body: "Check lifetime" } , epoch: null} as Artifact;
  const reviewStart = { ...start, data: { ...start.data, workflow: "review" as const } };
  const review = sessionGraph(state([diff, narrative("N"), reviewStart, note], "review"))!;
  assert.equal(review.nodes.find((item) => item.id === "N1")?.data.kind, "note");
});

test("stepNodeId targets visible change or commit node by zoom level", () => {
  const change = { id: "c3" } as ChangeNodeData["change"];
  const step = { narrativeId: "N", commit: 1, change };
  assert.equal(stepNodeId(step, "patch"), "N#commit-1");
  assert.equal(stepNodeId(step, "concept"), "N#c3");
  assert.equal(stepNodeId({ ...step, commit: null }, "patch"), "N#c3");
});
