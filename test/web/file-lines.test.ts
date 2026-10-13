import { test } from "node:test";
import assert from "node:assert/strict";

test("loadFileLines rejects failed requests with their HTTP status", async () => {
  Object.assign(globalThis, { document: { getElementById: () => null } });
  const { loadFileLines } = await import("../../src/web/file-lines.ts");
  const { RequestError } = await import("../../src/web/api.ts");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "Missing file" }), { status: 404, headers: { "content-type": "application/json" } });
  try {
    await assert.rejects(loadFileLines("status-test", "diff", "missing.txt"), (error: unknown) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.message, "Missing file");
      assert.equal(error.status, 404);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
