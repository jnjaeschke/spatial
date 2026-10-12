import type { Artifact, DecisionData, DecisionOption } from "../shared/types.ts";

/** The latest Decision when it is still open. */
export function openDecision(artifacts: Artifact[]): Artifact<DecisionData> | null {
  const latest = artifacts.findLast((artifact) => artifact.type === "Decision") as Artifact<DecisionData> | undefined;
  return latest && latest.data.chosen === null ? latest : null;
}

/** Why `option` cannot be sent with `text` (the server checks the same); null when it can. */
export function optionProblem(option: DecisionOption, text: string): string | null {
  const trimmed = text.trim();
  if (option.requiresText && !trimmed) return "Text required";
  if (trimmed && option.textPattern && !new RegExp(option.textPattern).test(trimmed)) return `Must match ${option.textPattern}`;
  return null;
}
