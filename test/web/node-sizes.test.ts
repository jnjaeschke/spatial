import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSizes } from "../../src/web/node-sizes.ts";

test("parseSizes keeps sizes by node id and ignores entries of any other shape", () => {
  assert.deepEqual(parseSizes(null), {});
  assert.deepEqual(parseSizes(JSON.stringify({ a: { width: 500 }, b: { height: 90, width: 400 } })), { a: { width: 500 }, b: { height: 90, width: 400 } });
  assert.deepEqual(parseSizes(JSON.stringify({ concept: { a: { width: 500 } }, code: {}, a: { width: 600 }, junk: 3, none: null })), { a: { width: 600 } });
});
