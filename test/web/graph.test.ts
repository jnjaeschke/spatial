import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, DiffData, PatchNarrativeData, SessionState } from "../../src/shared/types.ts";
import { estimateSize, latestNarrative, layout, narrativeGraph, placeSatellites, sessionGraph, zoomLevel } from "../../src/web/graph.ts";

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
  session: { id: "S", repo: "/r", title: "t", createdAt: "0" }, artifacts, links: [], tasks: [], lastEventId: 0, sourceBase: null,
});

test("zoomLevel thresholds", () => {
  assert.deepEqual([0.2, 0.44, 0.45, 0.89, 0.9, 1.5].map(zoomLevel), ["patch", "patch", "concept", "concept", "code", "code"]);
});

test("latestNarrative picks the newest narrative and its diff", () => {
  assert.equal(latestNarrative(state([diff])), null);
  const r = latestNarrative(state([diff, narrative("N1"), narrative("N2")]));
  assert.equal(r?.narrative.id, "N2");
  assert.equal(r?.diff.id, "D");
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

test("sessionGraph ignores spec refs of older narratives", () => {
  const spec = { id: "R", sessionId: "S", type: "SpecReference", status: "verified" as const, createdAt: "3", provenance: { taskId: "t" }, data: { url: "u", resolved: null, geckoRefs: [] } };
  const st = state([diff, narrative("N1"), narrative("N2"), spec]);
  st.links = [{ id: "l1", sessionId: "S", from: "R", to: "N1#c2", kind: "supports" }];
  assert.ok(!sessionGraph(st)!.nodes.some((n) => n.id === "R"));
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
