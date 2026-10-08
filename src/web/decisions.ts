import type { Artifact, DecisionData, DecisionOption, LlmSelection } from "../shared/types.ts";

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

const key = (repoDir: string) => `spatial-ide:decision-model:${repoDir}`;
/** The model last chosen in a decision of this repository, or null. */
export function readModelChoice(storage: Pick<Storage, "getItem">, repoDir: string): LlmSelection | null {
  try {
    const value = JSON.parse(storage.getItem(key(repoDir)) ?? "null") as Partial<LlmSelection> | null;
    return value && typeof value.backend === "string" && typeof value.model === "string" && typeof value.effort === "string" ? value as LlmSelection : null;
  } catch { return null; }
}
export function saveModelChoice(storage: Pick<Storage, "setItem">, repoDir: string, llm: LlmSelection): void { storage.setItem(key(repoDir), JSON.stringify(llm)); }
