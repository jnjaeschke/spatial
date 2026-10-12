import { test } from "node:test";
import assert from "node:assert/strict";
import { hopOf, latestTraces, traceMarkdown, traceSequence, traceStatus, verdictLine } from "../../../src/plugins/spec/shared/traces.ts";
import { isSpecRef } from "../../../src/plugins/spec/shared/refs.ts";
import type { SpecTraceCheckData, SpecTraceData, SpecTraceEntry } from "../../../src/plugins/spec/shared/types.ts";
import type { Artifact } from "../../../src/shared/types.ts";

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

const hopEntry = (anchor: string, step: string, hop?: SpecTraceEntry["hop"]): SpecTraceEntry => ({ anchor, step, note: "", ...(hop ? { hop } : {}) });

test("hopOf keeps a generated entry's hop and infers hand-built ones from the path", () => {
  const handBuilt = [hopEntry("A#a", "1"), hopEntry("A#b", "1"), hopEntry("A#b", "2"), hopEntry("A#a", "3")];
  assert.deepEqual(handBuilt.map((_, i) => hopOf(handBuilt, i)), ["start", "call", "next", "return"]);
  const generated = [hopEntry("A#a", "1", "start"), hopEntry("A#a", "4", "async"), hopEntry("A#c", "1", "call")];
  assert.deepEqual(generated.map((_, i) => hopOf(generated, i)), ["start", "async", "call"]);
});

test("traceSequence draws generated hops: async rows, next as self", () => {
  const trace: SpecTraceData = { traceId: "t", title: "T", entries: [hopEntry("A#a", "1", "start"), hopEntry("A#b", "1", "async"), hopEntry("A#b", "2", "next"), hopEntry("A#a", "2", "return")] };
  assert.deepEqual(traceSequence(trace, new Map()).rows.map((row) => row.kind), ["async", "self", "return"]);
});

let n = 0;
const artifact = <T>(type: string, data: T, taskId = "user") => ({ id: `a${++n}`, sessionId: "s", type, status: "verified", data, provenance: { taskId }, epoch: 1, createdAt: "" }) as Artifact<T>;
const check = (traceArtifactId: string, extra: Partial<SpecTraceCheckData> = {}): SpecTraceCheckData => ({ traceId: "t", traceArtifactId, verdict: null, hops: [], notes: [], code: [], droppedCode: [], ...extra });

test("traceStatus: a check of the latest version is current, a user edit after it makes it outdated", () => {
  const generated = artifact<SpecTraceData>("SpecTrace", { traceId: "t", title: "T", question: { mode: "claim", text: "q" }, entries: [hopEntry("A#a", "1", "start")] }, "task-1");
  const checked = artifact("SpecTraceCheck", check(generated.id));
  assert.deepEqual(traceStatus([generated, checked], "t"), { trace: generated, check: checked, outdated: false });
  const edited = artifact<SpecTraceData>("SpecTrace", { ...generated.data, entries: [{ ...generated.data.entries[0]!, note: "mine" }] });
  assert.deepEqual(traceStatus([generated, checked, edited], "t"), { trace: edited, check: checked, outdated: true });
  assert.deepEqual(traceStatus([generated], "t"), { trace: generated, check: null, outdated: false });
  assert.equal(traceStatus([generated], "other"), null);
});

test("verdictLine counts steps, unverified hops and unsupported notes; a scenario has no answer", () => {
  const ok = { ok: true, reason: "" }, bad = { ok: false, reason: "x" };
  const hops = [ok, ok, bad, ok, ok, ok, ok, ok, ok];
  assert.equal(verdictLine(check("a", { verdict: { answer: "fails", reasoning: "r" }, hops, notes: hops.map(() => null) })), "fails · 9 steps, 1 unverified hop, 0 unsupported notes");
  assert.equal(verdictLine(check("a", { hops: [ok], notes: [{ supported: false, reason: "no" }] })), "1 step, 0 unverified hops, 1 unsupported note");
  assert.equal(verdictLine(check("a", { droppedCode: [{ entry: 0, ref: 0, reason: "gone" }] })).endsWith(", 1 code reference dropped"), true);
});

test("isSpecRef accepts SPEC#anchor refs only", () => {
  assert.deepEqual(["HTML#navigate", "CSS-GRID#grid-container", "navigate", "https://html.spec.whatwg.org/#navigate", "HTML#"].map(isSpecRef), [true, true, false, false, false]);
});
