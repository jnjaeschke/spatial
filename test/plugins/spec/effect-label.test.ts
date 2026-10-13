import { test } from "node:test";
import assert from "node:assert/strict";
import { effectLabel } from "../../../src/plugins/spec/shared/effect-label.ts";
import type { SpecEffect } from "../../../src/plugins/spec/shared/types.ts";

const base = (overrides: Partial<SpecEffect> = {}): SpecEffect => ({ id: "ef_test", kind: "fire_event", params: { name: "load", target: null }, execution: ["inline"], ...overrides });

test("effectLabel says may, humanises the kind and lists non-null params by name", () => {
  assert.equal(effectLabel(base()), "may fire event name=load");
  assert.equal(effectLabel(base({ kind: "post-task", params: {} })), "may post task");
  assert.equal(effectLabel(base({ params: { name: "load", target: null, bubbles: true } })), "may fire event bubbles=true name=load");
  assert.equal(effectLabel(base({ params: {} })), "may fire event");
});

test("effectLabel marks separate execution", () => {
  assert.equal(effectLabel(base({ execution: ["separate"] })), "may fire event name=load (separate)");
  assert.equal(effectLabel(base({ execution: ["inline", "separate"] })), "may fire event name=load (inline or separate)");
  assert.equal(effectLabel(base({ execution: ["unknown"] })), "may fire event name=load (separate)");
});
