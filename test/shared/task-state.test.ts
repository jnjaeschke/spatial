import { test } from "node:test";
import assert from "node:assert/strict";
import { isActive, taskState } from "../../src/shared/task-state.ts";

test("isActive: pending and running tasks only", () => {
  assert.deepEqual((["pending", "running", "succeeded", "failed", "cancelled"] as const).map((status) => isActive({ status })), [true, true, false, false, false]);
});

test("taskState: busy while a matching task of the kinds is active; the error when the latest one failed", () => {
  const task = (kind: string, status: string, algorithmId = "A", error: string | null = null) => ({ kind, status, input: { algorithmId }, error }) as never;
  const KINDS = ["summarizeAlgorithm", "verifySummary"];
  const of = (algorithmId: string) => (input: unknown) => (input as { algorithmId?: string }).algorithmId === algorithmId;
  assert.deepEqual(taskState([task("summarizeAlgorithm", "running")], KINDS, of("A")), { busy: true, failed: null });
  assert.deepEqual(taskState([task("summarizeAlgorithm", "succeeded"), task("verifySummary", "failed", "A", "boom")], KINDS, of("A")), { busy: false, failed: "boom" });
  assert.deepEqual(taskState([task("summarizeAlgorithm", "failed", "A", "boom"), task("summarizeAlgorithm", "succeeded")], KINDS, of("A")), { busy: false, failed: null });
  assert.deepEqual(taskState([task("summarizeAlgorithm", "failed", "B", "boom"), task("mapEngine", "failed", "A", "x")], KINDS, of("A")), { busy: false, failed: null });
  assert.deepEqual(taskState([task("summarizeAlgorithm", "failed", "A", "boom"), task("verifySummary", "pending")], KINDS, of("A")), { busy: true, failed: null });
});
