import type { SpecEffect } from "../../../plugin-api.ts";

const executionSuffix = (execution: string[]) => execution.includes("inline") && execution.includes("separate") ? " (inline or separate)" : !execution.includes("inline") ? " (separate)" : "";

/** A short label for an effect, with may-semantics: `may fire event name=load (separate)`. */
export function effectLabel(effect: SpecEffect): string {
  const params = Object.entries(effect.params).filter(([, value]) => value !== null).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(" ");
  return ["may", effect.kind.replace(/[_-]/g, " "), params].filter(Boolean).join(" ") + executionSuffix(effect.execution);
}
