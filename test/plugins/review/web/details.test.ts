import { test } from "node:test";
import assert from "node:assert/strict";
import { backDetail, canGoBack, closeDetails, openDetail, type DetailsState, type Detail } from "../../../../src/plugins/review/web/details.ts";

const initial: DetailsState = { current: null, back: [] };
const file: Detail = { kind: "file", file: { diffId: "D", path: "a.ts", hunkId: "h" } };
const interdiff: Detail = { kind: "interdiff" };

test("opening details pushes the current item and reopening it is a no-op", () => {
  const opened = openDetail(openDetail(initial, file), interdiff);
  assert.deepEqual(opened, { current: interdiff, back: [file] });
  assert.equal(openDetail(opened, interdiff), opened);
});

test("Back restores and removes the most recent item", () => {
  assert.deepEqual(backDetail(openDetail(openDetail(initial, file), interdiff)), { current: file, back: [] });
  assert.deepEqual(backDetail(initial), initial);
});

test("the back stack keeps at most twenty items", () => {
  let state: DetailsState = initial;
  for (let i = 0; i < 22; i++) state = openDetail(state, { kind: "comment", id: String(i) });
  assert.equal(state.back.length, 20);
  assert.deepEqual(state.back[0], { kind: "comment", id: "1" });
});

test("closing details resets current and back stack", () => {
  assert.deepEqual(closeDetails(), initial);
});

test("Back skips items that no longer resolve and closes when none is left", () => {
  const gone: Detail = { kind: "comment", id: "draft" };
  const state = openDetail(openDetail(openDetail(initial, file), gone), interdiff);
  const resolves = (detail: Detail) => detail !== gone;
  assert.equal(canGoBack(state, resolves), true);
  assert.deepEqual(backDetail(state, resolves), { current: file, back: [] });
  const onlyGone = openDetail(openDetail(initial, gone), interdiff);
  assert.equal(canGoBack(onlyGone, resolves), false);
  assert.deepEqual(backDetail(onlyGone, resolves), initial);
});
