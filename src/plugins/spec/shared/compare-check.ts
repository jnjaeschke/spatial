import type { Engine } from "../../../plugin-api.ts";
import type { SpecStep } from "./steps.ts";
import type { EngineDifference } from "./types.ts";
import { quoteProblem } from "./engine.ts";
import { citedText } from "./summary-check.ts";

/** The files a comparison was given, by engine and path. */
export type ComparedFiles = Partial<Record<Engine, Record<string, string[]>>>;
const identifiers = (text: string) => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);

/** Why a difference fails deterministic checks; empty when it passes. */
export function comparisonErrors(difference: EngineDifference, steps: SpecStep[], files: ComparedFiles): string[] {
  const known = new Set(steps.map((step) => step.number));
  const errors = difference.steps.filter((step) => !known.has(step)).map((step) => `cites step ${step}, which the algorithm does not have`);
  const stepText = difference.steps.filter((step) => known.has(step)).map((step) => citedText(steps, step)).join("\n");
  const allCode: string[] = [];
  for (const claim of difference.claims) {
    if (!claim.code.length) errors.push(`the ${claim.engine} claim cites no code`);
    const code: string[] = [];
    for (const ref of claim.code) {
      const lines = files[claim.engine]?.[ref.path];
      const problem = quoteProblem(lines?.join("\n") ?? null, ref);
      if (problem) errors.push(`${claim.engine} ${problem}`);
      else code.push(lines![ref.line - 1]!);
    }
    allCode.push(...code);
    errors.push(...identifiers(claim.text).filter((id) => !code.some((text) => text.includes(id)) && !stepText.includes(id)).map((id) => `the ${claim.engine} claim names \`${id}\`, which its code and steps do not contain`));
  }
  errors.push(...identifiers(difference.summary).filter((id) => !allCode.some((text) => text.includes(id)) && !stepText.includes(id)).map((id) => `the summary names \`${id}\`, which the cited code and steps do not contain`));
  return errors;
}

/** The cited steps, claims and code lines of a difference, for the verifier. */
export function citedEvidence(difference: EngineDifference, steps: SpecStep[], files: ComparedFiles): string {
  return ["Cited steps:", ...difference.steps.map((step) => `[${step}] ${citedText(steps, step)}`), "Claims:", ...difference.claims.flatMap((claim) => [`- ${claim.engine}: ${claim.text}`, ...claim.code.map((ref) => `  ${claim.engine} ${ref.path}:${ref.line}: ${files[claim.engine]?.[ref.path]?.[ref.line - 1] ?? ""}`)])].join("\n");
}
