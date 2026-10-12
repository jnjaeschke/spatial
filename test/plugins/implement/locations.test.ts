import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyLocations } from "../../../src/plugins/implement/runtime/locations.ts";

const files: Record<string, string> = { "a.txt": "alpha\nbeta\ngamma\ndelta\nepsilon\n" };
const read = async (path: string) => { if (!(path in files)) throw new Error("missing"); return files[path]!; };
const loc = (path: string, line: number, quote: string) => ({ path, line, quote, why: "w", step: null });

test("locations: nearest match within two lines wins and corrects the line", async () => {
  const { verified, dropped } = await verifyLocations([loc("a.txt", 2, "beta"), loc("a.txt", 3, "beta"), loc("a.txt", 4, "beta"), loc("a.txt", 5, "beta")], read);
  assert.deepEqual(verified.map((l) => l.line), [2, 2, 2]);
  assert.equal(dropped.length, 1);
  assert.match(dropped[0]!, /a\.txt:5/);
});

test("locations: missing files, empty and unmatched quotes are dropped with a reason", async () => {
  const { verified, dropped } = await verifyLocations([loc("gone.txt", 1, "x"), loc("a.txt", 1, "  "), loc("a.txt", 1, "nothere"), loc("a.txt", 1, "  alpha ")], read);
  assert.deepEqual(verified.map((l) => l.line), [1]);
  assert.deepEqual(dropped.map((d) => d.replace(/^\S+: /, "")), ["file not found at the base", "empty quote", "quote not found near the line"]);
});
