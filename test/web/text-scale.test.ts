import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTextScale, stepTextScale } from "../../src/web/text-scale.ts";

test("parseTextScale accepts only supported values", () => {
  assert.equal(parseTextScale(null), 1);
  assert.equal(parseTextScale("1.3"), 1.3);
  assert.equal(parseTextScale("0.9"), 0.9);
  for (const raw of ["2", "abc", "", "1.31"]) assert.equal(parseTextScale(raw), 1);
});

test("stepTextScale moves through supported values and clamps", () => {
  assert.equal(stepTextScale(1, 1), 1.15);
  assert.equal(stepTextScale(1, -1), 0.9);
  assert.equal(stepTextScale(0.9, -1), 0.9);
  assert.equal(stepTextScale(1.6, 1), 1.6);
  assert.equal(stepTextScale(1.3, 1), 1.45);
  assert.equal(stepTextScale(7, -1), 0.9);
});
