import { test } from "node:test";
import assert from "node:assert/strict";
import { columnState, taskState } from "../../../../src/plugins/spec/web/implementations.ts";
import { cellHighlighted, compareEnabled, differenceTargets } from "../../../../src/plugins/spec/web/implementations.ts";
import type { EngineMapping, EngineSite } from "../../../../src/plugins/spec/shared/types.ts";

test("columnState: busy while a mapping, search or alignment of this algorithm and engine runs; the latest failure otherwise", () => {
  const task = (kind: string, status: string, engine: string, error: string | null = null) => ({ kind, status, input: { algorithmId: "A", engine }, error }) as never;
  assert.deepEqual(columnState([task("mapEngine", "failed", "blink", "chromium-search exited with code 127")], "A", "blink"), { busy: false, failed: "chromium-search exited with code 127" });
  assert.deepEqual(columnState([task("mapEngine", "failed", "blink", "x"), task("findImplementation", "running", "blink")], "A", "blink"), { busy: true, failed: null });
  assert.deepEqual(columnState([task("alignSteps", "running", "gecko")], "A", "blink"), { busy: false, failed: null });
  assert.deepEqual(columnState([task("mapEngine", "failed", "blink", "x"), task("mapEngine", "succeeded", "blink")], "A", "blink"), { busy: false, failed: null });
  assert.deepEqual(columnState([task("alignSteps", "failed", "blink", "no function")], "A", "blink"), { busy: false, failed: "no function" });
});

const site = (method: EngineSite["method"], stale = false): EngineSite => ({ path: "a.cc", line: 1, symbol: "S", signature: "void S() {", quote: "void S() {", method, refs: [], steps: [], ...(stale ? { stale: true as const } : {}) });
const mapping = (engine: EngineMapping["engine"], sites: EngineSite[]): EngineMapping => ({ engine, repoBase: "r/", rev: "x", sites, tests: [], rejected: [], checkedAt: "" });

test("taskState: busy while a matching task of the kinds runs; the error when the latest one failed", () => {
  const task = (kind: string, status: string, algorithmId = "A", error: string | null = null) => ({ kind, status, input: { algorithmId }, error }) as never;
  const KINDS = ["compareEngines", "verifyComparison"];
  const of = (algorithmId: string) => (input: unknown) => (input as { algorithmId?: string }).algorithmId === algorithmId;
  assert.deepEqual(taskState([task("compareEngines", "running")], KINDS, of("A")), { busy: true, failed: null });
  assert.deepEqual(taskState([task("compareEngines", "succeeded"), task("verifyComparison", "failed", "A", "boom")], KINDS, of("A")), { busy: false, failed: "boom" });
  assert.deepEqual(taskState([task("compareEngines", "failed", "A", "boom"), task("compareEngines", "succeeded")], KINDS, of("A")), { busy: false, failed: null });
  assert.deepEqual(taskState([task("compareEngines", "failed", "B", "boom"), task("mapEngine", "failed", "A", "x")], KINDS, of("A")), { busy: false, failed: null });
  assert.deepEqual(taskState([task("compareEngines", "failed", "A", "boom"), task("verifyComparison", "pending")], KINDS, of("A")), { busy: true, failed: null });
});

test("compareEnabled needs two engines with a confirmed or spec-link site", () => {
  assert.equal(compareEnabled({ gecko: mapping("gecko", [site("spec-link")]), blink: mapping("blink", [site("llm")]), webkit: mapping("webkit", [site("user", true)]) }), false);
  assert.equal(compareEnabled({ gecko: mapping("gecko", [site("spec-link")]), blink: mapping("blink", [site("spec-link-heuristic")]), webkit: null }), true);
});

test("a difference highlights its steps and the cells whose range holds a cited line", () => {
  const targets = differenceTargets({ kind: "order", steps: ["2", "3"], summary: "s", claims: [{ engine: "blink", text: "t", code: [{ path: "a.cc", line: 12, quote: "q" }] }] });
  assert.deepEqual([...targets.steps], ["2", "3"]);
  assert.equal(cellHighlighted(targets, "blink", "a.cc", 10, 14), true);
  assert.equal(cellHighlighted(targets, "blink", "a.cc", 13, 14), false);
  assert.equal(cellHighlighted(targets, "gecko", "a.cc", 10, 14), false);
  assert.equal(cellHighlighted(null, "blink", "a.cc", 10, 14), false);
});
