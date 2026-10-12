import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stepLinks } from "../../../src/plugins/spec/shared/steps.ts";
import { asyncEffectIds, checkHops, witnessKey, type TraceFacts } from "../../../src/plugins/spec/shared/trace-check.ts";
import { stepEffects } from "../../../src/plugins/spec/shared/effects.ts";
import type { SpecAlgorithmData, SpecTraceEntry, StepEffect } from "../../../src/plugins/spec/shared/types.ts";
import type { SpecEffect, SpecHop } from "../../../src/shared/types.ts";

const algorithm = (ref: string, content: string, stepEffectsByPath: Record<string, StepEffect[]> = {}, effects: SpecEffect[] = []): SpecAlgorithmData => ({ ref, spec: ref.split("#")[0]!, anchor: ref.split("#")[1]!, title: ref, type: "algorithm", url: `https://x/#${ref}`, content, sha: "s", outgoingRefs: 0, effects, effectsStatus: { state: "ready", semantics: "may", issues: [], omitted: 0 }, stepEffects: stepEffectsByPath });
const effect = (id: string, kind: string): SpecEffect => ({ id, kind, params: {}, execution: ["separate"] });
const A = algorithm("X#a", "1. Prepare with [d](X#d).\n2. Let *x* be the result of [b](X#b).\n3. [Queue a task](HTML#queue-a-task) to:\n\n    1. Run [c](X#c).\n\n    > **Note:** See [b](X#b).\n4. Return *x*.", { "3": [{ effectId: "q", via: "direct" }], "4": [{ effectId: "s", via: "direct" }] }, [effect("q", "scheduling.enqueue"), effect("s", "script.invoke")]);
const B = algorithm("X#b", "1. Do it.\n2. Return.");
const C = algorithm("X#c", "1. Fire.\n2. Done.");
const D = algorithm("X#d", "1. Handle.");
const site = (ref: string, step?: number[]) => ({ spec: ref.split("#")[0]!, anchor: ref.split("#")[1]!, ...(step ? { step_path: step } : {}) });
const facts = (witnesses: [string, SpecHop[]][] = [], unknown: [string, string][] = []): TraceFacts => ({ algorithms: new Map([A, B, C, D].map((a) => [a.ref, a])), unknown: new Map(unknown), witnesses: new Map(witnesses) });
const e = (anchor: string, step: string, hop: SpecTraceEntry["hop"]): SpecTraceEntry => ({ anchor, step, note: "", hop });
const reasons = (entries: SpecTraceEntry[], f = facts()) => checkHops(entries, f).map((r) => r.ok ? "" : r.reason);

test("stepLinks lists each step's own links, notes excluded", () => {
  assert.deepEqual(stepLinks(A.content), { 1: ["X#d"], 2: ["X#b"], 3: ["HTML#queue-a-task"], "3.1": ["X#c"], 4: [] });
});
test("a valid trace passes every hop", () => {
  assert.deepEqual(reasons([e("X#a", "2", "start"), e("X#b", "1", "call"), e("X#b", "2", "next"), e("X#a", "3", "return"), e("X#c", "1", "async"), e("X#a", "4", "return")]), ["", "", "", "", "", ""]);
});
test("existence and start: unknown anchors, missing steps, a missing or repeated start", () => {
  assert.deepEqual(reasons([e("X#zz", "1", "start"), e("X#b", "9", "call"), e("X#b", "1", "start")], facts([], [["X#zz", "Unknown spec: X"]])), ["X#zz is not a known spec section: Unknown spec: X", "X#b has no step 9", "Only the first entry starts the trace"]);
  assert.deepEqual(reasons([e("X#a", "2", "call"), e("X#b", "1", "call")]), ["The first entry starts the trace", ""]);
  assert.deepEqual(reasons([e("X#a", "9", "start"), e("X#b", "1", "call")]), ["X#a has no step 9", "The previous entry X#a step 9 is not verified"]);
});
test("call needs a link in the previous step's own text", () => {
  assert.deepEqual(reasons([e("X#a", "4", "start"), e("X#b", "1", "call")]), ["", "X#a step 4 does not link X#b"]);
  assert.deepEqual(reasons([e("X#a", "3", "start"), e("X#b", "1", "call")]), ["", "X#a step 3 does not link X#b"]);
});
test("return goes back to another algorithm on the path, at or after where the walk left it", () => {
  assert.deepEqual(reasons([e("X#a", "2", "start"), e("X#b", "1", "call"), e("X#c", "1", "return")]), ["", "", "X#c is not earlier on the path"]);
  assert.deepEqual(reasons([e("X#a", "2", "start"), e("X#b", "1", "call"), e("X#a", "1", "return")]), ["", "", "Step 1 of X#a is before step 2, where the walk left X#a"]);
  assert.deepEqual(reasons([e("X#a", "2", "start"), e("X#b", "1", "call"), e("X#a", "2", "return")]), ["", "", ""]);
  assert.deepEqual(reasons([e("X#a", "2", "start"), e("X#a", "3", "return")]), ["", "A return leaves X#a; a later step of it is a next hop"]);
});
test("next stays in the algorithm and moves forward", () => {
  assert.deepEqual(reasons([e("X#b", "2", "start"), e("X#b", "1", "next")]), ["", "Step 1 of X#b is not after step 2"]);
  assert.deepEqual(reasons([e("X#a", "1", "start"), e("X#b", "1", "next")]), ["", "A next hop stays in X#a"]);
});
test("async needs a scheduling or event effect of the previous step that reaches the entry", () => {
  assert.deepEqual(reasons([e("X#a", "3", "start"), e("X#c", "1", "async")]), ["", ""]);
  assert.deepEqual(reasons([e("X#a", "3", "start"), e("X#a", "4", "async")]), ["", ""]);
  assert.deepEqual(reasons([e("X#a", "3", "start"), e("X#a", "2", "async")]), ["", "Step 2 of X#a is not after step 3"]);
  const toD: SpecHop[] = [{ from: site("X#a"), to: site("X#d"), site: site("X#a", [3]) }, { from: site("X#d"), to: site("X#d", [1]), site: site("X#d", [1]) }];
  assert.deepEqual(reasons([e("X#a", "3", "start"), e("X#d", "1", "async")], facts([[witnessKey("X#a", "q"), toD]])), ["", ""]);
  assert.deepEqual(reasons([e("X#a", "3", "start"), e("X#b", "1", "async")], facts([[witnessKey("X#a", "q"), toD]])), ["", "No scheduling or event effect of X#a step 3 reaches X#b"]);
  assert.deepEqual(reasons([e("X#a", "2", "start"), e("X#c", "1", "async")]), ["", "X#a step 2 has no scheduling or event effect"]);
  assert.deepEqual(reasons([e("X#a", "4", "start"), e("X#c", "1", "async")]), ["", "X#a step 4 has no scheduling or event effect"]);
  assert.deepEqual(asyncEffectIds(A, "3"), ["q"]);
});
test("HTML#navigate: async hops on the captured effects", () => {
  const query = JSON.parse(readFileSync(new URL("../../fixtures/webspec/navigate-query.json", import.meta.url), "utf8"));
  const raw = JSON.parse(readFileSync(new URL("../../fixtures/webspec/navigate-effects.json", import.meta.url), "utf8"));
  const explanations = raw.explanations.map((x: any) => ({ effectId: x.effect_id, witnesses: x.witnesses.map((w: any) => w.hops.map((h: any) => ({ from: h.from, to: h.to, site: h.site.subject }))) }));
  const navigate: SpecAlgorithmData = { ...algorithm("HTML#navigate", query.content, stepEffects(raw.effects, explanations, { spec: "HTML", anchor: "navigate" }), raw.effects) };
  const abort = algorithm("HTML#abort-a-navigateevent", "1. a\n2. b\n3. c\n4. d\n5. e\n6. [Fire an event](DOM#concept-event-fire) named navigateerror.");
  const witness = explanations.find((x: any) => x.effectId === "ef_c99e007831cfabc9").witnesses[0];
  const navigateFacts: TraceFacts = { algorithms: new Map([[navigate.ref, navigate], [abort.ref, abort]]), unknown: new Map(), witnesses: new Map([[witnessKey("HTML#navigate", "ef_c99e007831cfabc9"), witness]]) };
  assert.ok(stepLinks(query.content)["2"]!.includes("HTML#snapshotting-source-snapshot-params"));
  assert.deepEqual(reasons([e("HTML#navigate", "8", "start"), e("HTML#navigate", "9", "async")], navigateFacts), ["", ""]);
  assert.deepEqual(reasons([e("HTML#navigate", "20", "start"), e("HTML#abort-a-navigateevent", "6", "async")], navigateFacts), ["", ""]);
  assert.deepEqual(reasons([e("HTML#navigate", "3", "start"), e("HTML#navigate", "9", "async")], navigateFacts), ["", "HTML#navigate step 3 has no scheduling or event effect"]);
});
