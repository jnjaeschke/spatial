import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_LANES, layoutLanes } from "../../../src/plugins/scm/shared/lanes.ts";

const c = (sha: string, ...parents: string[]) => ({ sha, parents });

test("a linear history stays in column 0", () => {
  const { rows, state } = layoutLanes(EMPTY_LANES, [c("c3", "c2"), c("c2", "c1"), c("c1")]);
  assert.deepEqual(rows, [
    { sha: "c3", column: 0, color: 0, up: [], down: [{ from: 0, to: 0, color: 0 }] },
    { sha: "c2", column: 0, color: 0, up: [{ from: 0, to: 0, color: 0 }], down: [{ from: 0, to: 0, color: 0 }] },
    { sha: "c1", column: 0, color: 0, up: [{ from: 0, to: 0, color: 0 }], down: [] },
  ]);
  assert.deepEqual(state, { lanes: [], colors: [], next: 1 });
});

test("a merge opens a lane for its second parent, which merges back into the first parent's lane", () => {
  const { rows } = layoutLanes(EMPTY_LANES, [c("M", "A", "B"), c("A", "O"), c("B", "O"), c("O")]);
  assert.deepEqual(rows, [
    { sha: "M", column: 0, color: 0, up: [], down: [{ from: 0, to: 0, color: 0 }, { from: 0, to: 1, color: 1 }] },
    { sha: "A", column: 0, color: 0, up: [{ from: 0, to: 0, color: 0 }, { from: 1, to: 1, color: 1 }], down: [{ from: 0, to: 0, color: 0 }, { from: 1, to: 1, color: 1 }] },
    { sha: "B", column: 1, color: 1, up: [{ from: 0, to: 0, color: 0 }, { from: 1, to: 1, color: 1 }], down: [{ from: 1, to: 0, color: 0 }, { from: 0, to: 0, color: 0 }] },
    { sha: "O", column: 0, color: 0, up: [{ from: 0, to: 0, color: 0 }], down: [] },
  ]);
});

test("a commit whose parent already has a lane joins that lane at once", () => {
  const { rows } = layoutLanes(EMPTY_LANES, [c("X", "O"), c("Y", "O"), c("O")]);
  assert.deepEqual(rows.map((row) => row.column), [0, 1, 0]);
  assert.deepEqual(rows[1]!.down, [{ from: 1, to: 0, color: 0 }, { from: 0, to: 0, color: 0 }]);
  assert.deepEqual(rows[2]!.up, [{ from: 0, to: 0, color: 0 }]);
});

test("an octopus merge opens one lane per extra parent", () => {
  const { rows } = layoutLanes(EMPTY_LANES, [c("M", "A", "B", "C"), c("A", "O"), c("B", "O"), c("C", "O"), c("O")]);
  assert.deepEqual(rows.map((row) => row.column), [0, 0, 1, 2, 0]);
  assert.deepEqual(rows[0]!.down.map((seg) => seg.to), [0, 1, 2]);
});

test("freed columns are reused, so width follows concurrent branches", () => {
  const { rows } = layoutLanes(EMPTY_LANES, [c("M2", "M1", "S2"), c("S2", "M1"), c("M1", "M0", "S1"), c("S1", "M0"), c("M0")]);
  assert.deepEqual(rows.map((row) => row.column), [0, 1, 0, 1, 0]);
  assert.ok(rows.every((row) => [...row.up, ...row.down].every((seg) => seg.from <= 1 && seg.to <= 1)));
});

test("unrelated roots each get a new color", () => {
  const { rows } = layoutLanes(EMPTY_LANES, [c("B"), c("A")]);
  assert.deepEqual(rows.map((row) => [row.column, row.color]), [[0, 0], [0, 1]]);
});

test("laying out page by page equals laying out at once", () => {
  const history = [c("M2", "M1", "S2"), c("S2", "S1"), c("M1", "M0"), c("S1", "M0"), c("T", "M0"), c("M0", "R"), c("R")];
  const whole = layoutLanes(EMPTY_LANES, history);
  for (let split = 0; split <= history.length; split++) {
    const a = layoutLanes(EMPTY_LANES, history.slice(0, split));
    const b = layoutLanes(a.state, history.slice(split));
    assert.deepEqual([...a.rows, ...b.rows], whole.rows, `split at ${split}`);
    assert.deepEqual(b.state, whole.state);
  }
});
