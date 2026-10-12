import { test } from "node:test";
import assert from "node:assert/strict";
import { promiseCache } from "../../src/web/promise-cache.ts";

test("promiseCache shares one load per key and retries after a rejection", async () => {
  const cached = promiseCache<number>();
  let loads = 0;
  const failing = () => { loads++; return Promise.reject(new Error("down")); };
  await assert.rejects(cached("a", failing), /down/);
  assert.equal(await cached("a", () => { loads++; return Promise.resolve(1); }), 1);
  assert.equal(await cached("a", () => { loads++; return Promise.resolve(2); }), 1);
  assert.equal(loads, 2);
});
