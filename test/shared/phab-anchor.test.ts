import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, DiffData, PatchNarrativeData, PhabCommentData } from "../../src/shared/types.ts";
import { phabView } from "../../src/shared/phab-anchor.ts";

const make = <T,>(id: string, type: string, data: T): Artifact<T> => ({ id, sessionId: "S", type, data, status: "verified", provenance: { taskId: "runtime" }, createdAt: id });
const diff = (id: string, newLines: { kind: "ctx" | "add" | "del"; text: string }[], oldStart = 28): Artifact<DiffData> => make(id, "Diff", {
  baseSha: "b", headSha: id, commits: [], files: [{ path: "a.txt", status: "modified", binary: false, hunks: [{ id: `${id}h0`, header: "@@", oldStart, oldLines: newLines.length, newStart: 28, newLines: newLines.filter((line) => line.kind !== "del").length, lines: newLines }] }],
});
const narrative = (id: string, diffId: string, hunkId: string | null): Artifact<PatchNarrativeData> => make(id, "PatchNarrative", {
  diffId, summary: "summary", changes: hunkId ? [{ id: "c", title: "change", explanation: "", rationale: "", hunkIds: [hunkId], dependsOn: [], specUrls: [] }] : [],
});
const comment = (id: string, values: Partial<PhabCommentData> = {}) => make<PhabCommentData>(id, "PhabComment", {
  revision: 1, phid: id, version: 1, author: "alice", body: "body", path: "a.txt", line: 30, length: 1, diffId: 1, isNewFile: true, own: false, done: false, txId: 1, dateCreated: 1, ...values,
});
const sync = (diffId: string, matchingDiffId: number | null) => make("sync-" + diffId, "PhabSync", { localDiff: diffId, matchingDiffId, revision: 1, latestDiffId: 1 });

test("phabView anchors direct new-side comments only on narrated hunks", () => {
  const d = diff("D1", [{ kind: "add", text: "one" }, { kind: "ctx", text: "target" }, { kind: "add", text: "three" }, { kind: "add", text: "four" }, { kind: "add", text: "five" }, { kind: "add", text: "six" }, { kind: "add", text: "seven" }]);
  const c = comment("C", { line: 29 });
  const artifacts = [d, narrative("N", "D1", "D1h0"), sync("D1", 1), c];
  const view = phabView(artifacts, d, artifacts[1]!.data as PatchNarrativeData);
  assert.equal(view.anchored[0]?.anchor, "D1#D1h0");
  assert.equal(view.anchored[0]?.fromEpoch, null);
  assert.equal(phabView(artifacts, d, narrative("empty", "D1", null).data).unanchored.length, 1);
});

test("phabView carries prior comments by matching line text and preserves outdated comments", () => {
  const old = diff("D1", [{ kind: "add", text: "first" }, { kind: "add", text: "target" }, { kind: "add", text: "last" }]);
  const current = diff("D2", [{ kind: "add", text: "first" }, { kind: "add", text: "inserted" }, { kind: "add", text: "target" }, { kind: "add", text: "last" }]);
  const n1 = narrative("N1", "D1", "D1h0"), n2 = narrative("N2", "D2", "D2h0"), c = comment("C", { diffId: 1, line: 29 });
  const artifacts = [old, n1, sync("D1", 1), current, n2, sync("D2", null), c];
  const view = phabView(artifacts, current, n2.data);
  assert.equal(view.anchored[0]?.anchor, "D2#D2h0");
  assert.equal(view.anchored[0]?.line, 30);
  assert.equal(view.anchored[0]?.fromEpoch, 1);
  const removed = diff("D2", [{ kind: "add", text: "first" }, { kind: "add", text: "different" }, { kind: "add", text: "last" }]);
  const removedView = phabView([...artifacts.filter((a) => a.id !== "D2"), removed, narrative("N2", "D2", "D2h0"), sync("D2", null)], removed, narrative("N2", "D2", "D2h0").data);
  assert.equal(removedView.unanchored[0]?.outdatedEpoch, 1);
});

test("phabView leaves unlisted and old-side latest comments separate, and carries old deletions", () => {
  const old = diff("D1", [{ kind: "del", text: "removed" }, { kind: "ctx", text: "kept" }]);
  const current = diff("D2", [{ kind: "del", text: "removed" }, { kind: "ctx", text: "kept" }]);
  const n1 = narrative("N1", "D1", "D1h0"), n2 = narrative("N2", "D2", "D2h0");
  const direct = comment("direct", { diffId: 2, line: 29, isNewFile: false });
  const oldSide = comment("old-side", { diffId: 2, line: 28, isNewFile: false });
  const carried = comment("carried", { diffId: 1, line: 28, isNewFile: false });
  const arts = [old, n1, sync("D1", 1), current, n2, sync("D2", 2), direct, oldSide, carried];
  const view = phabView(arts, current, n2.data);
  assert.deepEqual(view.anchored.map((item) => [item.anchorId, item.side, item.fromEpoch]), [["carried", "old", 1]]);
  assert.deepEqual(view.unanchored.map((item) => [item.diffId, item.oldSide, item.outdatedEpoch]), [[2, true, null]]);
  assert.equal(view.unanchored[0]?.comments.length, 2);
  const noStory = phabView(arts, current, narrative("N2-empty", "D2", null).data);
  assert.ok(noStory.unanchored.some((item) => item.diffId === 2 && item.outdatedEpoch === null));
});

test("phabView groups replies after their root, uses root done state, and omits own comments", () => {
  const d = diff("D1", [{ kind: "add", text: "one" }, { kind: "add", text: "target" }, { kind: "add", text: "three" }, { kind: "add", text: "four" }, { kind: "add", text: "five" }, { kind: "add", text: "six" }, { kind: "add", text: "seven" }]);
  const root = comment("root", { phid: "ROOT", line: 29, done: true, txId: 5 });
  const reply = comment("reply", { phid: "REPLY", replyTo: "ROOT", line: 29, done: false, txId: 4 });
  const own = comment("own", { own: true });
  const general = comment("general", { path: undefined, line: undefined, isNewFile: undefined, diffId: undefined });
  const arts = [d, narrative("N", "D1", "D1h0"), sync("D1", 1), root, reply, own, general];
  const view = phabView(arts, d, arts[1]!.data as PatchNarrativeData);
  assert.deepEqual(view.anchored[0]?.comments.map((item) => item.id), ["root", "reply"]);
  assert.equal(view.anchored[0]?.done, true);
  assert.deepEqual(view.general.map((item) => item.id), ["general"]);
  assert.ok(!view.anchored.some((item) => item.anchorId === "own"));
});
