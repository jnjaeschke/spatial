import test from "node:test";
import assert from "node:assert/strict";
import type { ChangeNodeData } from "../../src/plugins/review/web/graph.ts";
import { moveStep, startStep, stepNodeId } from "../../src/web/guide.ts";

const change = { id: "c3" } as ChangeNodeData["change"];

test("startStep selects the first unreviewed change or the beginning", () => {
  assert.equal(startStep([true, false, false]), 1);
  assert.equal(startStep([true, true]), 0);
  assert.equal(startStep([]), 0);
});

test("moveStep starts at Start here and clamps subsequent moves", () => {
  assert.equal(moveStep(3, null, 1, 2), 2);
  assert.equal(moveStep(3, null, -1, 2), 2);
  assert.equal(moveStep(3, 2, 1, 0), 2);
  assert.equal(moveStep(3, 0, -1, 0), 0);
  assert.equal(moveStep(3, 1, 1, 0), 2);
});

test("stepNodeId targets visible change or commit node by zoom level", () => {
  const step = { narrativeId: "N", commit: 1, change };
  assert.equal(stepNodeId(step, "patch"), "N#commit-1");
  assert.equal(stepNodeId(step, "concept"), "N#c3");
  assert.equal(stepNodeId({ ...step, commit: null }, "patch"), "N#c3");
});
