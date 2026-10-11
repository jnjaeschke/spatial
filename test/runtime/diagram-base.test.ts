import { test } from "node:test";
import assert from "node:assert/strict";
import { isDiagram, verifyDiagramAtBase } from "../../src/runtime/diagram.ts";

const step = (symbol: string, line: number) => ({ from: "a", to: "a", symbol, call: `${symbol}()`, what: "w", when: null, guard: null, phase: null, status: "existing", cite: { path: "x.cpp", line } });
const proposal = (over: object = {}) => ({ commit: 1, title: "T", summary: "S", lanes: [{ id: "a", label: "A", note: null }], steps: [step("Foo", 2), step("Missing", 2)], before: null, ...over });
const show = async (sha: string, path: string) => { assert.equal(sha, "BASE"); assert.equal(path, "x.cpp"); return "line one\nFoo();\n"; };

test("isDiagram accepts a proposal and rejects a wrong shape", () => {
  assert.equal(isDiagram(proposal()), true);
  assert.equal(isDiagram({ ...proposal(), lanes: [{ id: "a" }] }), false);
});

test("a sequence about existing code is verified against the base commit", async () => {
  const result = await verifyDiagramAtBase(proposal(), "BASE", show);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.data.commit, "BASE");
  assert.deepEqual(result.data.steps.map((s) => s.verified), [true, false]);
});

test("invalid shapes and a commit other than 1 are errors", async () => {
  assert.deepEqual(await verifyDiagramAtBase({ nonsense: true }, "BASE", show), { ok: false, error: "diagram has an invalid shape" });
  const second = await verifyDiagramAtBase(proposal({ commit: 2 }), "BASE", show);
  assert.equal(second.ok, false);
});
