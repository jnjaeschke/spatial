import test from "node:test";
import assert from "node:assert/strict";
import { browserCommand, ensureServer, probe, startScreenUrl } from "../../src/cli/launch.ts";

const response = (status: number, body?: unknown): Response => new Response(body === undefined ? null : JSON.stringify(body), { status });
const health = { app: "spatial-ide", ui: true } as const;

test("start screen URL and browser command", () => {
  assert.equal(startScreenUrl(4177, "/a b/c"), "http://127.0.0.1:4177/?path=%2Fa%20b%2Fc");
  assert.equal(browserCommand("darwin"), "open");
  assert.equal(browserCommand("linux"), "xdg-open");
});

test("probe classifies free, foreign, and spatial servers", async () => {
  assert.equal(await probe(1, async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }); }), "free");
  assert.equal(await probe(1, async () => response(404)), "foreign");
  assert.equal(await probe(1, async () => response(200, { app: "other" })), "foreign");
  assert.equal(await probe(1, async () => new Response("not json")), "foreign");
  assert.deepEqual(await probe(1, async () => response(200, health)), health);
  const error = new Error("network failed");
  await assert.rejects(probe(1, async () => { throw error; }), error);
});

test("ensureServer reuses a healthy server and rejects a foreign one", async () => {
  let starts = 0;
  assert.deepEqual(await ensureServer({ port: 1, fetchImpl: async () => response(200, health), startServer: () => { starts++; throw new Error("unexpected"); } }), health);
  await assert.rejects(ensureServer({ port: 1, fetchImpl: async () => response(404), startServer: () => { starts++; throw new Error("unexpected"); } }), /in use by another program/);
  assert.equal(starts, 0);
});

test("ensureServer waits for health after starting", async () => {
  let probes = 0;
  let starts = 0;
  const result = await ensureServer({
    port: 1,
    intervalMs: 1,
    fetchImpl: async () => ++probes < 3 ? Promise.reject(Object.assign(new Error("refused"), { cause: { code: "ECONNREFUSED" } })) : response(200, health),
    startServer: () => { starts++; return { exited: new Promise(() => {}), log: "/x/server.log" }; },
  });
  assert.deepEqual(result, health);
  assert.equal(starts, 1);
});

test("ensureServer reports early exit and timeout", async () => {
  const free = async () => { throw Object.assign(new Error("refused"), { cause: { code: "ECONNREFUSED" } }); };
  await assert.rejects(ensureServer({ port: 1, fetchImpl: free, intervalMs: 1, startServer: () => ({ exited: Promise.resolve(1), log: "/x/server.log" }) }), /exited with code 1; see .*server\.log/);
  await assert.rejects(ensureServer({ port: 1, fetchImpl: free, timeoutMs: 20, intervalMs: 1, startServer: () => ({ exited: new Promise(() => {}), log: "/x/server.log" }) }), /did not answer/);
});

test("ensureServer probes health before observing a racing child exit", async () => {
  let probes = 0;
  const result = await ensureServer({
    port: 1,
    fetchImpl: async () => ++probes === 1 ? Promise.reject(Object.assign(new Error("refused"), { cause: { code: "ECONNREFUSED" } })) : response(200, health),
    startServer: () => ({ exited: Promise.resolve(1), log: "/x/server.log" }),
  });
  assert.deepEqual(result, health);
});
