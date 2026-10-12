import { test } from "node:test";
import assert from "node:assert/strict";
import { diffsOf, diffNumber, importRefs, interdiffOf, latestDiff, narrativeOf, sessionRefs } from "../../../../src/plugins/review/shared/diffs.ts";
import type { Artifact, Link, TaskRecord } from "../../../../src/shared/types.ts";

const artifact = <T,>(id: string, type: string, data: T): Artifact<T> => ({ id, sessionId: "S", type, status: "verified", data, provenance: { taskId: "t" }, createdAt: id, epoch: null});
const d1 = artifact("D1", "Diff", { baseSha: "b", headSha: "h", commits: [], files: [] });
const d2 = artifact("D2", "Diff", { baseSha: "b2", headSha: "h2", commits: [], files: [] });
const n1 = artifact("N1", "PatchNarrative", { diffId: "D1", summary: "", changes: [] });
const imp = (id: string, input: unknown, output: unknown, status: TaskRecord["status"] = "succeeded"): TaskRecord => ({ id, sessionId: "S", kind: "importDiff", status, input, output, error: null, createdAt: id, updatedAt: id, epoch: null, parentId: null });

test("epoch helpers derive Diff order, narratives, import refs, and latest interdiff", () => {
  const artifacts = [d1, n1, d2, artifact("I1", "Interdiff", {}), artifact("I2", "Interdiff", {}), artifact("I3", "Interdiff", {})];
  assert.deepEqual(diffsOf(artifacts).map((d) => d.id), ["D1", "D2"]);
  assert.equal(latestDiff(artifacts)?.id, "D2");
  assert.equal(diffNumber(artifacts, "D1"), 1);
  assert.equal(diffNumber(artifacts, "D2"), 2);
  assert.throws(() => diffNumber(artifacts, "N1"), /not a Diff/);
  assert.equal(narrativeOf(artifacts, "D1")?.id, "N1");
  assert.equal(narrativeOf(artifacts, "D2"), null);
  const tasks = [imp("T1", { base: "main", head: "feature" }, { diffId: "D1" }), imp("T2", { base: "sha-b", head: "sha-h" }, { diffId: "D2" }), imp("TF", { base: "x", head: "y" }, { diffId: "D1" }, "failed"), imp("TO", { base: "x", head: "y" }, { diffId: "else" })];
  assert.deepEqual(importRefs(tasks, "D1"), { base: "main", head: "feature" });
  assert.deepEqual(importRefs(tasks, "D2"), { base: "sha-b", head: "sha-h" });
  assert.equal(importRefs(tasks, "none"), null);
  assert.deepEqual(sessionRefs(artifacts, tasks), { base: "main", head: "feature" });
  const links: Link[] = [
    { id: "l1", sessionId: "S", from: "I1", to: "D1", kind: "about" },
    { id: "l2", sessionId: "S", from: "I2", to: "D1", kind: "about" },
    { id: "l3", sessionId: "S", from: "I3", to: "D2", kind: "about" },
  ];
  assert.equal(interdiffOf(artifacts, links, "D1")?.id, "I2");
  assert.equal(interdiffOf(artifacts, links, "D2")?.id, "I3");
});
