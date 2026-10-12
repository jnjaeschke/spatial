import { test } from "node:test";
import assert from "node:assert/strict";
import { hopOf, traceSequence, traceStatus, verdictLine } from "../../../src/plugins/spec/shared/traces.ts";
import { isSpecRef } from "../../../src/plugins/spec/shared/refs.ts";
import type { SpecTraceCheckData, SpecTraceData, SpecTraceEntry } from "../../../src/plugins/spec/shared/types.ts";
import type { Artifact } from "../../../src/shared/types.ts";

const entry = (anchor: string, step: string, hop?: SpecTraceEntry["hop"]): SpecTraceEntry => ({ anchor, step, note: "", ...(hop ? { hop } : {}) });

test("hopOf keeps a generated entry's hop and infers hand-built ones from the path", () => {
  const handBuilt = [entry("A#a", "1"), entry("A#b", "1"), entry("A#b", "2"), entry("A#a", "3")];
  assert.deepEqual(handBuilt.map((_, i) => hopOf(handBuilt, i)), ["start", "call", "next", "return"]);
  const generated = [entry("A#a", "1", "start"), entry("A#a", "4", "async"), entry("A#c", "1", "call")];
  assert.deepEqual(generated.map((_, i) => hopOf(generated, i)), ["start", "async", "call"]);
});

test("traceSequence draws generated hops: async rows, next as self", () => {
  const trace: SpecTraceData = { traceId: "t", title: "T", entries: [entry("A#a", "1", "start"), entry("A#b", "1", "async"), entry("A#b", "2", "next"), entry("A#a", "2", "return")] };
  assert.deepEqual(traceSequence(trace, new Map()).rows.map((row) => row.kind), ["async", "self", "return"]);
});

let n = 0;
const artifact = <T>(type: string, data: T, taskId = "user") => ({ id: `a${++n}`, sessionId: "s", type, status: "verified", data, provenance: { taskId }, epoch: 1, createdAt: "" }) as Artifact<T>;
const check = (traceArtifactId: string, extra: Partial<SpecTraceCheckData> = {}): SpecTraceCheckData => ({ traceId: "t", traceArtifactId, verdict: null, hops: [], notes: [], notesTaskId: null, ...extra });

test("traceStatus: a check of the latest version is current, a user edit after it makes it outdated", () => {
  const generated = artifact<SpecTraceData>("SpecTrace", { traceId: "t", title: "T", question: { mode: "claim", text: "q" }, entries: [entry("A#a", "1", "start")] }, "task-1");
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
});

test("isSpecRef accepts SPEC#anchor refs only", () => {
  assert.deepEqual(["HTML#navigate", "CSS-GRID#grid-container", "navigate", "https://html.spec.whatwg.org/#navigate", "HTML#"].map(isSpecRef), [true, true, false, false, false]);
});
