import type { LlmSelection, RuntimeEvent, UsageRun } from "../shared/types.ts";
import type { LlmUsage } from "./llm/types.ts";

/** USD per million tokens, from LiteLLM's model_prices_and_context_window.json as of 2026-10-12. Claude reports each run's cost itself. */
const CODEX_PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-6.1-sol": { input: 2, cachedInput: 0.1, output: 10 },
  "gpt-6-astra": { input: 10, cachedInput: 1, output: 50 },
  "gpt-6-sol": { input: 2, cachedInput: 0.2, output: 10 },
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
  "gpt-5.6-sol": { input: 4, cachedInput: 0.4, output: 20 },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
};

interface UsagePayload { selection: LlmSelection; providerSessionId?: string; usage: (Partial<LlmUsage> & Pick<LlmUsage, "inputTokens" | "outputTokens">) | null }

type Counts = Pick<LlmUsage, "inputTokens" | "cachedInputTokens" | "outputTokens">;

/** Each `llm.usage` event as one run with its own tokens and cost. Cumulative counts become the difference to the provider session's previous run, which also bills runs in between that failed before reporting. Events from before tokens were metered keep only a reported cost. */
export function meteredRuns(events: RuntimeEvent[]): UsageRun[] {
  const totals = new Map<string, Counts>();
  return events.map((event) => {
    const { selection, providerSessionId, usage } = event.payload as UsagePayload;
    const run = { ts: event.ts, sessionId: event.sessionId, backend: selection.backend, model: selection.model };
    if (!usage || usage.cumulative === undefined || usage.cachedInputTokens === undefined) return { ...run, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: usage?.costUsd ?? null };
    let counts: Counts = { inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens, outputTokens: usage.outputTokens };
    if (usage.cumulative && providerSessionId !== undefined) {
      const before = totals.get(providerSessionId);
      totals.set(providerSessionId, counts);
      if (before) counts = { inputTokens: counts.inputTokens - before.inputTokens, cachedInputTokens: counts.cachedInputTokens - before.cachedInputTokens, outputTokens: counts.outputTokens - before.outputTokens };
    }
    return { ...run, ...counts, costUsd: usage.costUsd ?? priced(selection, counts) };
  });
}

function priced(selection: LlmSelection, counts: Counts): number | null {
  const price = selection.backend === "codex" ? CODEX_PRICES[selection.model] : undefined;
  if (!price) return null;
  return ((counts.inputTokens - counts.cachedInputTokens) * price.input + counts.cachedInputTokens * price.cachedInput + counts.outputTokens * price.output) / 1e6;
}
