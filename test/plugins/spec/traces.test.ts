import { test } from "node:test";
import assert from "node:assert/strict";
import { latestTraces, traceMarkdown, traceSequence } from "../../../src/plugins/spec/shared/traces.ts";
import type { SpecTraceData } from "../../../src/plugins/spec/shared/types.ts";

const entry = (anchor: string, step: string, note = "") => ({ anchor, step, note });
const trace: SpecTraceData = { traceId: "t", title: "T", entries: [entry("HTML#navigate", "5", "starts here\nand here"), entry("HTML#foo", "3"), entry("HTML#bar", "2"), entry("HTML#foo", "7", "back"), entry("HTML#baz", "1"), entry("HTML#baz", "4")] };
const algorithms = new Map([["HTML#navigate", { title: "navigate", url: "https://h/#navigate" }], ["HTML#foo", { title: "foo", url: "https://h/#foo" }], ["HTML#bar", { title: "bar", url: "https://h/#bar" }], ["HTML#baz", { title: "baz", url: "https://h/#baz" }]]);

test("latestTraces keeps the latest version of each trace in creation order", () => {
  const a = (traceId: string, title: string) => ({ type: "SpecTrace", data: { traceId, title, entries: [] } }) as never;
  assert.deepEqual(latestTraces([a("1", "one"), a("2", "two"), { type: "Other", data: {} } as never, a("1", "one renamed")]).map((t) => t.title), ["one renamed", "two"]);
});

test("traceMarkdown writes revisits as separate entries with notes indented", () => {
  assert.equal(traceMarkdown(trace, algorithms), [
    "[navigate step 5](https://h/#navigate)", "  starts here", "  and here", "→ [foo step 3](https://h/#foo)", "→ [bar step 2](https://h/#bar)", "→ [foo step 7](https://h/#foo)", "  back", "→ [baz step 1](https://h/#baz)", "→ [baz step 4](https://h/#baz)",
  ].join("\n"));
  assert.throws(() => traceMarkdown({ ...trace, entries: [entry("HTML#gone", "1")] }, algorithms), /HTML#gone is not loaded/);
});

test("traceSequence: lanes in first appearance, calls to new lanes, returns to earlier lanes, self hops", () => {
  const titles = new Map([...algorithms].map(([ref, a]) => [ref, a.title]));
  const { lanes, rows } = traceSequence(trace, titles);
  assert.deepEqual(lanes.map((lane) => lane.label), ["navigate", "foo", "bar", "baz"]);
  assert.deepEqual(rows.map((row) => [row.index, row.kind, row.from, row.to, row.step, row.note]), [
    [0, "call", "HTML#navigate", "HTML#foo", "3", ""], [1, "call", "HTML#foo", "HTML#bar", "2", ""], [2, "return", "HTML#bar", "HTML#foo", "7", "back"], [3, "call", "HTML#foo", "HTML#baz", "1", ""], [4, "self", "HTML#baz", "HTML#baz", "4", ""],
  ]);
  assert.deepEqual(traceSequence({ ...trace, entries: [entry("HTML#foo", "1")] }, titles), { lanes: [{ id: "HTML#foo", label: "foo", note: "HTML#foo" }], rows: [] });
});
