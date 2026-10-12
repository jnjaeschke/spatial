import type { Artifact, DecisionData } from "./types.ts";

/** The answer of the latest answered Decision with `key` stamped with `epoch`, or null. */
export function chosenDecision(view: { artifacts: Artifact[] }, epoch: number, key: string): DecisionData["chosen"] {
  const decision = view.artifacts.findLast((a) => a.type === "Decision" && a.epoch === epoch && (a.data as DecisionData).key === key && (a.data as DecisionData).chosen);
  return (decision?.data as DecisionData | undefined)?.chosen ?? null;
}
