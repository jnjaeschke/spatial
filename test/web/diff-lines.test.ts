import { test } from "node:test";
import assert from "node:assert/strict";
import { numberLines } from "../../src/web/diff-lines.ts";

test("numbers old/new sides per line kind", () => {
  const out = numberLines({
    id: "f0h0", header: "@@ -10,3 +20,3 @@", oldStart: 10, oldLines: 3, newStart: 20, newLines: 3,
    lines: [{ kind: "ctx", text: "a" }, { kind: "del", text: "b" }, { kind: "add", text: "c" }, { kind: "ctx", text: "d" }],
  });
  assert.deepEqual(out, [
    { kind: "ctx", text: "a", old: 10, new: 20 },
    { kind: "del", text: "b", old: 11 },
    { kind: "add", text: "c", new: 21 },
    { kind: "ctx", text: "d", old: 12, new: 22 },
  ]);
});
