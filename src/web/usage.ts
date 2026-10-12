import type { UsageRun } from "../shared/types.ts";

export interface ModelUsage {
  /** `backend/model`. */
  key: string;
  runs: number;
  /** Runs whose cost is unknown and missing from `costUsd`. */
  unpricedRuns: number;
  costUsd: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

/** Spend and tokens per model, most expensive first. */
export function usageByModel(runs: UsageRun[]): ModelUsage[] {
  const models = new Map<string, ModelUsage>();
  for (const run of runs) {
    const key = `${run.backend}/${run.model}`;
    let model = models.get(key);
    if (!model) models.set(key, model = { key, runs: 0, unpricedRuns: 0, costUsd: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
    model.runs++;
    if (run.costUsd === null) model.unpricedRuns++;
    else model.costUsd += run.costUsd;
    model.inputTokens += run.inputTokens;
    model.cachedInputTokens += run.cachedInputTokens;
    model.outputTokens += run.outputTokens;
  }
  return [...models.values()].sort((a, b) => b.costUsd - a.costUsd || a.key.localeCompare(b.key));
}

/** Spend per model for each of the `count` local days up to `today`, oldest first. */
export function usageByDay(runs: UsageRun[], count: number, today: Date): { day: string; costUsd: Map<string, number> }[] {
  const days = Array.from({ length: count }, (_, i) => ({ day: localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - 1 - i))), costUsd: new Map<string, number>() }));
  const byDay = new Map(days.map((entry) => [entry.day, entry.costUsd]));
  for (const run of runs) {
    const costs = run.costUsd === null ? undefined : byDay.get(localDay(new Date(run.ts)));
    if (!costs) continue;
    const key = `${run.backend}/${run.model}`;
    costs.set(key, (costs.get(key) ?? 0) + run.costUsd!);
  }
  return days;
}

const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const formatUsd = (usd: number) => `$${usd < 10 ? usd.toFixed(2) : usd < 1000 ? usd.toFixed(1) : Math.round(usd).toLocaleString("en-US")}`;

export const formatTokens = (tokens: number) => tokens < 1e3 ? String(tokens) : tokens < 1e6 ? `${(tokens / 1e3).toFixed(1)}k` : `${(tokens / 1e6).toFixed(1)}M`;
