import { test } from "node:test";
import assert from "node:assert/strict";
import { sequenceLayout } from "../../src/web/sequence-layout.ts";

test("sequenceLayout places phase rows, directions and self steps", () => {
  const { cells, rowCount } = sequenceLayout(["a", "b", "c"], [
    { from: "a", to: "b", phase: "P" }, { from: "b", to: "a", phase: "P" }, { from: "c", to: "c", phase: "Q" }, { from: "a", to: "a", phase: null },
  ]);
  assert.deepEqual(cells, [
    { firstLane: 0, lastLane: 1, direction: "right", loopAt: undefined, stepRow: 3, phaseRow: 2 },
    { firstLane: 0, lastLane: 1, direction: "left", loopAt: undefined, stepRow: 4, phaseRow: null },
    { firstLane: 1, lastLane: 2, direction: "self", loopAt: "75%", stepRow: 6, phaseRow: 5 },
    { firstLane: 0, lastLane: 1, direction: "self", loopAt: "25%", stepRow: 7, phaseRow: null },
  ]);
  assert.equal(rowCount, 7);
  assert.deepEqual(sequenceLayout(["a", "b"], [{ from: "a", to: "b" }]).cells[0], { firstLane: 0, lastLane: 1, direction: "right", loopAt: undefined, stepRow: 2, phaseRow: null });
});
