import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ConduitClient, readArcToken } from "../../src/runtime/conduit.ts";

test("ConduitClient.call returns result on success", async () => {
  const fake = async () => new Response(JSON.stringify({ error_code: null, error_info: null, result: { id: 42 } }));
  const client = new ConduitClient("https://phab.example.com", "tok", fake);
  assert.deepEqual(await client.call("some.method", { x: 1 }), { id: 42 });
});

test("ConduitClient.call throws on Conduit error", async () => {
  const fake = async () => new Response(JSON.stringify({ error_code: "ERR", error_info: "Bad", result: null }));
  const client = new ConduitClient("https://phab.example.com", "tok", fake);
  await assert.rejects(client.call("some.method", {}), /Bad/);
});

function withArcConfig<T>(config: unknown, run: (path: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "spatial-arcrc-"));
  const path = join(dir, "arcrc.json");
  const previousPath = process.env.SPATIAL_ARCRC_PATH;
  writeFileSync(path, JSON.stringify(config));
  process.env.SPATIAL_ARCRC_PATH = path;
  try {
    return run(path);
  } finally {
    if (previousPath === undefined) delete process.env.SPATIAL_ARCRC_PATH;
    else process.env.SPATIAL_ARCRC_PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("readArcToken extracts token for host from arcrc", () => {
  withArcConfig({ hosts: { "https://phab.example.com/api/": { token: "T1" } } }, () => {
    assert.equal(readArcToken("https://phab.example.com"), "T1");
  });
});

test("readArcToken throws on missing host", () => {
  withArcConfig({ hosts: {} }, (path) => {
    assert.throws(() => readArcToken("https://phab.example.com"), new RegExp(`No arcrc token.*${path}`));
  });
});
