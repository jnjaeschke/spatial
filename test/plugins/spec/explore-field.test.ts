import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { makeWebspec } from "../../../src/runtime/webspec.ts";
import { specExploreField } from "../../../src/plugins/spec/runtime/explore-field.ts";

const ctx = { webspec: makeWebspec({ bin: fileURLToPath(new URL("../../stubs/fake-webspec.mjs", import.meta.url)) }), signal: new AbortController().signal } as never;

test("specExplore stores an explore request for known sections, without a phase run", async () => {
  assert.deepEqual(await specExploreField.accept(ctx, { anchors: ["HTML#navigate", "HTML#setup"], question: null }), { ok: true, artifacts: [{ type: "SpecExploreRequest", data: { anchors: ["HTML#navigate", "HTML#setup"], question: null } }] });
});

test("specExplore carries a claim or scenario to trace, and rejects a malformed question", async () => {
  const question = { mode: "claim", text: "document is non-null at step 7" };
  assert.deepEqual(await specExploreField.accept(ctx, { anchors: ["HTML#navigate"], question }), { ok: true, artifacts: [{ type: "SpecExploreRequest", data: { anchors: ["HTML#navigate"], question } }] });
  for (const bad of [undefined, { mode: "guess", text: "x" }, { mode: "claim", text: " " }]) {
    assert.deepEqual(await specExploreField.accept(ctx, { anchors: ["HTML#navigate"], question: bad }), { ok: false, error: 'specExplore.question must be null or { mode: "claim" | "scenario", text }' });
  }
});

test("specExplore rejects malformed values and unknown sections", async () => {
  for (const value of [{}, { anchors: [], question: null }, { anchors: ["navigate"], question: null }, { anchors: Array.from({ length: 6 }, (_, i) => `HTML#a${i}`), question: null }]) {
    assert.deepEqual(await specExploreField.accept(ctx, value), { ok: false, error: "specExplore needs 1 to 5 SPEC#anchor refs" });
  }
  assert.deepEqual(await specExploreField.accept(ctx, { anchors: ["HTML#navigate", "NOPE"], question: null }), { ok: false, error: "specExplore needs 1 to 5 SPEC#anchor refs" });
});

test("specExplore rejects a section webspec-index does not know", async () => {
  const unknown = { webspec: { query: async () => ({ found: false, reason: "Section not found: HTML#gone" }) }, signal: new AbortController().signal } as never;
  assert.deepEqual(await specExploreField.accept(unknown, { anchors: ["HTML#gone"], question: null }), { ok: false, error: "unknown spec section HTML#gone: Section not found: HTML#gone" });
});

test("specExplore rejects a non-object value", async () => {
  for (const value of [null, "HTML#navigate", 3, undefined]) {
    assert.deepEqual(await specExploreField.accept(ctx, value), { ok: false, error: "specExplore needs 1 to 5 SPEC#anchor refs" });
  }
});
