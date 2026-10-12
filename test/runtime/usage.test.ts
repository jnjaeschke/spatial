import { test } from "node:test";
import assert from "node:assert/strict";
import { meteredRuns } from "../../src/runtime/usage.ts";
import type { RuntimeEvent } from "../../src/shared/types.ts";

let id = 0;
const event = (payload: unknown): RuntimeEvent => ({ id: ++id, sessionId: "s", actor: "task:t", type: "llm.usage", payload, ts: `2026-10-12T10:00:0${id % 10}Z` });
const codex = (providerSessionId: string, inputTokens: number, cachedInputTokens: number, outputTokens: number) =>
  event({ selection: { backend: "codex", model: "gpt-6.1-sol", effort: "high" }, providerSessionId, usage: { inputTokens, cachedInputTokens, outputTokens, cumulative: true } });

test("a codex run costs its fresh input, cached input and output at the model's price", () => {
  const [run] = meteredRuns([codex("th", 1_100_000, 1_000_000, 100_000)]);
  assert.deepEqual({ ...run, ts: undefined }, { ts: undefined, sessionId: "s", backend: "codex", model: "gpt-6.1-sol", inputTokens: 1_100_000, cachedInputTokens: 1_000_000, outputTokens: 100_000, costUsd: 1.3 });
});

test("a resumed codex thread counts only what it added since the thread's previous run", () => {
  const runs = meteredRuns([codex("a", 100, 50, 10), codex("b", 7, 0, 1), codex("a", 300, 200, 30)]);
  assert.deepEqual(runs.map((r) => [r.inputTokens, r.cachedInputTokens, r.outputTokens]), [[100, 50, 10], [7, 0, 1], [200, 150, 20]]);
});

test("claude's reported cost is the run's cost; an unpriced model has none", () => {
  const runs = meteredRuns([
    event({ selection: { backend: "claude", model: "opus", effort: "medium" }, providerSessionId: "c", usage: { inputTokens: 10, cachedInputTokens: 5, outputTokens: 2, costUsd: 0.5, cumulative: false } }),
    event({ selection: { backend: "codex", model: "gpt-unknown", effort: "low" }, providerSessionId: "x", usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 2, cumulative: true } }),
  ]);
  assert.deepEqual(runs.map((r) => r.costUsd), [0.5, null]);
});

test("a run recorded before tokens were metered keeps only its reported cost", () => {
  const runs = meteredRuns([
    event({ selection: { backend: "claude", model: "opus", effort: "medium" }, usage: { inputTokens: 26, outputTokens: 9264, costUsd: 0.49 } }),
    event({ selection: { backend: "codex", model: "gpt-6.1-sol", effort: "medium" }, usage: { inputTokens: 687631, outputTokens: 3770 } }),
    event({ selection: { backend: "codex", model: "gpt-6.1-sol", effort: "medium" }, usage: null }),
  ]);
  assert.deepEqual(runs.map((r) => [r.inputTokens, r.outputTokens, r.costUsd]), [[0, 0, 0.49], [0, 0, null], [0, 0, null]]);
});
