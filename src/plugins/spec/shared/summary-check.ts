import type { SpecStep } from "./steps.ts";
import type { SpecSummary } from "./types.ts";

/** The plain text of step `path` and its sub-steps, one step per line. */
export function citedText(steps: SpecStep[], path: string): string {
  return steps.filter((step) => step.number === path || step.number.startsWith(`${path}.`)).map((step) => step.text).join("\n");
}

/** Why a summary fails the deterministic check: 1 to 4 clauses, each citing existing steps, each backticked identifier occurring in the text of a cited step. Empty when it passes. */
export function checkSummary(clauses: SpecSummary["clauses"], steps: SpecStep[]): string[] {
  if (clauses.length < 1 || clauses.length > 4) return [`A summary has 1 to 4 clauses, got ${clauses.length}`];
  const known = new Set(steps.map((step) => step.number));
  return clauses.flatMap((clause, index) => {
    const label = `Clause ${index + 1}`;
    if (!clause.steps.length) return [`${label} cites no step`];
    const missing = clause.steps.filter((path) => !known.has(path));
    if (missing.length) return missing.map((path) => `${label} cites step ${path}, which the algorithm does not have`);
    const text = clause.steps.map((path) => citedText(steps, path)).join("\n");
    return [...clause.text.matchAll(/`([^`]+)`/g)].map((match) => match[1]!).filter((identifier) => !text.includes(identifier)).map((identifier) => `${label} names \`${identifier}\`, which its cited steps do not mention`);
  });
}
