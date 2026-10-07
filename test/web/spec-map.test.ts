import { test } from "node:test";
import assert from "node:assert/strict";
import type { StepLink } from "../../src/shared/types.ts";
import { parseSteps } from "../../src/shared/spec-text.ts";
import { linksByLine, stepStatuses } from "../../src/web/spec-map.ts";

const steps = parseSteps("1. A.\n2. B:\n\n    1. B1.\n    2. B2.\n3. C.\n4. D.");
const link = (step: string, kind: StepLink["kind"], start = 1, end = start): StepLink => ({ step, kind, ranges: [{ path: "a.cpp", side: "new", start, end }], note: "" });

test("a step shows its worst link; a parent with only linked substeps shows substeps", () => {
  const statuses = stepStatuses(steps, [link("1", "implements"), link("1", "deviates"), link("2.1", "partial"), link("3", "structural")]);
  assert.deepEqual(Object.fromEntries(statuses), { "1": "deviates", "2": "substeps", "2.1": "partial", "2.2": "unmapped", "3": "structural", "4": "unmapped" });
});

test("linksByLine lists every link covering a line once", () => {
  const a = link("1", "implements", 3, 5), b = link("2.1", "partial", 5, 5);
  const byLine = linksByLine([a, b, { ...a, step: "4", ranges: [...a.ranges, ...a.ranges] }]);
  assert.deepEqual(byLine.get("a.cpp:new:5")!.map((l) => l.step), ["1", "2.1", "4"]);
  assert.equal(byLine.get("a.cpp:new:4")!.length, 2);
  assert.equal(byLine.has("a.cpp:new:6"), false);
});
