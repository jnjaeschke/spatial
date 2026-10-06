import assert from "node:assert/strict";
import test from "node:test";
import { analysisStatus, retryBody } from "../../src/web/analysis.ts";

const task = (kind: string, status: string, error?: string, input: unknown = {}) => ({ kind, status, error, input });
const artifact = (type: string, data: unknown = {}) => ({ type, data, id: type });
const state = (tasks: unknown[] = [], artifacts: unknown[] = []) => ({ tasks, artifacts }) as any;

test("analysisStatus reports no analysis for a bare session", () => {
  assert.deepEqual(analysisStatus(state()), { state: "none" });
});

test("analysisStatus follows workflow starts and the latest analysis task", () => {
  assert.deepEqual(analysisStatus(state([], [artifact("WorkflowStart")])), { state: "running", step: null });
  assert.deepEqual(analysisStatus(state([task("importRevision", "running")])), { state: "running", step: "importRevision" });
  assert.deepEqual(analysisStatus(state([task("importRevision", "failed", "bad base")])), { state: "failed", step: "importRevision", error: "bad base" });
  assert.deepEqual(analysisStatus(state([task("importDiff", "pending")])), { state: "running", step: "importDiff" });
  assert.deepEqual(analysisStatus(state([task("narrate", "running")])), { state: "running", step: "narrate" });
  assert.deepEqual(analysisStatus(state([task("importRevision", "failed", "old"), task("narrate", "succeeded")])), { state: "running", step: null });
  assert.deepEqual(analysisStatus(state([task("importRevision", "succeeded"), task("importDiff", "pending")])), { state: "running", step: "importDiff" });
});

test("analysisStatus reports failed and cancelled latest steps", () => {
  assert.deepEqual(analysisStatus(state([task("importDiff", "failed", "bad ref")])), { state: "failed", step: "importDiff", error: "bad ref" });
  assert.deepEqual(analysisStatus(state([task("narrate", "cancelled")])), { state: "failed", step: "narrate", error: "Cancelled" });
});

test("retryBody chooses the latest analysis LLM and supports workflow retries", () => {
  const fallback = { backend: "codex", model: "m", effort: "low" } as const;
  const selected = { backend: "claude", model: "x", effort: "high" } as const;
  const diff = artifact("Diff");
  assert.deepEqual(retryBody(state([], [diff]), fallback), { llm: fallback });
  assert.deepEqual(retryBody(state([task("narrate", "failed", "x", { llm: selected })], [diff]), fallback), { llm: selected });
  for (const params of [{ base: "a", head: "b", revision: null }, { base: null, head: null, revision: "D7" }, { base: null, head: null, revision: null }]) {
    assert.deepEqual(retryBody(state([], [artifact("WorkflowStart", { params })]), fallback), { llm: fallback });
  }
  assert.equal(retryBody(state(), fallback), null);
});
