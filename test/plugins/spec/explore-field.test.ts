import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { makeWebspec } from "../../../src/runtime/webspec.ts";
import { specExploreField } from "../../../src/plugins/spec/runtime/explore-field.ts";

const ctx = { webspec: makeWebspec({ bin: fileURLToPath(new URL("../../stubs/fake-webspec.mjs", import.meta.url)) }), signal: new AbortController().signal } as never;

test("specExplore stores an explore request for known sections, without a phase run", async () => {
  assert.deepEqual(await specExploreField.accept(ctx, { anchors: ["HTML#navigate", "HTML#setup"] }), { ok: true, artifacts: [{ type: "SpecExploreRequest", data: { anchors: ["HTML#navigate", "HTML#setup"] } }] });
});

test("specExplore rejects malformed values and unknown sections", async () => {
  for (const value of [{}, { anchors: [] }, { anchors: ["navigate"] }, { anchors: Array.from({ length: 6 }, (_, i) => `HTML#a${i}`) }]) {
    assert.deepEqual(await specExploreField.accept(ctx, value), { ok: false, error: "specExplore needs 1 to 5 SPEC#anchor refs" });
  }
  assert.deepEqual(await specExploreField.accept(ctx, { anchors: ["HTML#navigate", "NOPE"] }), { ok: false, error: "specExplore needs 1 to 5 SPEC#anchor refs" });
});

test("specExplore rejects a section webspec-index does not know", async () => {
  const unknown = { webspec: { query: async () => ({ found: false, reason: "Section not found: HTML#gone" }) }, signal: new AbortController().signal } as never;
  assert.deepEqual(await specExploreField.accept(unknown, { anchors: ["HTML#gone"] }), { ok: false, error: "unknown spec section HTML#gone: Section not found: HTML#gone" });
});
