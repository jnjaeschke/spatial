import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { makeWebspec } from "../../../src/runtime/webspec.ts";
import { loadSpecAlgorithm } from "../../../src/plugins/spec/tasks/load-spec-algorithm/task.ts";
import type { SpecAlgorithmData } from "../../../src/plugins/spec/shared/types.ts";

const webspec = makeWebspec({ bin: fileURLToPath(new URL("../../stubs/fake-webspec.mjs", import.meta.url)) });
const ctxWith = (stored: { id: string; type: string; data: unknown }[]) => ({
  webspec, signal: new AbortController().signal,
  artifacts: { view: () => ({ artifacts: stored, links: [] }), put: (type: string, status: string, data: unknown) => { const a = { id: `A${stored.length + 1}`, type, status, data }; stored.push(a); return a; } },
}) as never;

test("loads a section once per ref and sha, with all effects attributed to steps", async () => {
  const stored: { id: string; type: string; data: unknown }[] = [];
  const first = await loadSpecAlgorithm.run(ctxWith(stored), { ref: "HTML#navigate" });
  const data = stored[0]!.data as SpecAlgorithmData;
  assert.equal(data.ref, "HTML#navigate");
  assert.equal(data.effects.length, 39);
  assert.equal(data.stepEffects["24.9.1"]![0]!.via, "direct");
  assert.deepEqual(await loadSpecAlgorithm.run(ctxWith(stored), { ref: "HTML#navigate" }), first);
  assert.equal(stored.length, 1);
});

test("an unknown section fails the task", async () => {
  await assert.rejects(loadSpecAlgorithm.run(ctxWith([]), { ref: "nope" }), /Spec section not found: URL not recognized: nope/);
});
