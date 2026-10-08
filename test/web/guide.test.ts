import test from "node:test";
import assert from "node:assert/strict";
import { moveStep, startStep } from "../../src/web/guide.ts";

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
