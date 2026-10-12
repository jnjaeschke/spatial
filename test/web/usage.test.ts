import { test } from "node:test";
import assert from "node:assert/strict";
import type { UsageRun } from "../../src/shared/types.ts";
import { formatUsd, usageByDay, usageByModel } from "../../src/web/usage.ts";

const run = (model: string, costUsd: number | null, ts = "2026-10-12T10:00:00", tokens: number | null = 10): UsageRun => ({ ts, sessionId: "s", backend: model.startsWith("gpt") ? "codex" : "claude", model, tokens: tokens === null ? null : { input: tokens, cachedInput: tokens / 2, output: 1 }, costUsd });

test("spend per model sums priced runs and metered tokens, counts the rest and puts the most expensive first", () => {
  assert.deepEqual(usageByModel([run("opus", 1), run("gpt-6.1-sol", 2), run("opus", 0.5, undefined, null), run("gpt-6.1-sol", null, undefined, 4)]), [
    { key: "codex/gpt-6.1-sol", runs: 2, unpricedRuns: 1, costUsd: 2, unmeteredRuns: 0, tokens: { input: 14, cachedInput: 7, output: 2 } },
    { key: "claude/opus", runs: 2, unpricedRuns: 0, costUsd: 1.5, unmeteredRuns: 1, tokens: { input: 10, cachedInput: 5, output: 1 } },
  ]);
});

test("spend per day covers the last days in local time, empty days included", () => {
  const days = usageByDay([run("opus", 1, "2026-10-12T23:30:00"), run("opus", 2, "2026-10-12T08:00:00"), run("gpt-6.1-sol", 3, "2026-10-10T12:00:00"), run("opus", 9, "2026-10-01T12:00:00"), run("opus", null)], 3, new Date(2026, 9, 12, 15));
  assert.deepEqual(days.map(({ day, costUsd }) => [day, Object.fromEntries(costUsd)]), [
    ["2026-10-10", { "codex/gpt-6.1-sol": 3 }],
    ["2026-10-11", {}],
    ["2026-10-12", { "claude/opus": 3 }],
  ]);
});

test("amounts keep cents below $10", () => {
  assert.deepEqual([formatUsd(0.004), formatUsd(4.567), formatUsd(45.67), formatUsd(4567)], ["$0.00", "$4.57", "$45.7", "$4,567"]);
});
