import assert from "node:assert/strict";
import test from "node:test";
import { latestSymbols, symbolMarks } from "../../../../src/plugins/review/web/symbols.ts";

const symbols = {
  NewThing: { sites: [{ path: "a.ts", hunkId: "h1", line: 4, commit: 1, kind: "declaration" as const }, { path: "b.cpp", hunkId: "h2", line: 9, commit: 0, kind: "definition" as const }] },
  Later: { sites: [{ path: "a.ts", hunkId: "h3", line: 9, commit: 2, kind: "definition" as const }] },
  Earlier: { sites: [{ path: "a.ts", hunkId: "h0", line: 1, commit: 0, kind: "definition" as const }] },
};

test("symbolMarks matches whole identifiers and marks every occurrence", () => {
  const marks = symbolMarks("NewThing NewThingy _NewThing NewThing2 NewThing", 0, symbols);
  assert.deepEqual(marks.map(({ start, end, name }) => ({ start, end, name })), [
    { start: 0, end: 8, name: "NewThing" },
    { start: 39, end: 47, name: "NewThing" },
  ]);
});

test("symbolMarks skips later definitions and labels earlier definitions", () => {
  assert.deepEqual(symbolMarks("Later Earlier", 1, symbols), [
    { start: 6, end: 13, name: "Earlier", highlight: "sym-earlier", title: "New in C1" },
  ]);
  assert.deepEqual(symbolMarks("NewThing", 0, symbols), [
    { start: 0, end: 8, name: "NewThing", highlight: "sym-this", title: "New in this patch" },
  ]);
});

test("latestSymbols returns the last artifact for the diff", () => {
  const first = { type: "IntroducedSymbols", data: { diffId: "d1", symbols: { A: symbols.Earlier } } };
  const other = { type: "IntroducedSymbols", data: { diffId: "d2", symbols: {} } };
  const last = { type: "IntroducedSymbols", data: { diffId: "d1", symbols: { B: symbols.Later } } };
  const state = { artifacts: [first, other, last] } as any;
  assert.deepEqual(latestSymbols(state, "d1"), last.data);
  assert.equal(latestSymbols(state, "d3"), null);
});

test("symbolMarks uses the earliest site's commit", () => {
  assert.deepEqual(symbolMarks("NewThing", 0, symbols), [{ start: 0, end: 8, name: "NewThing", highlight: "sym-this", title: "New in this patch" }]);
});
