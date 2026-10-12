import type { SpecStep } from "./steps.ts";
import type { EngineStep } from "./types.ts";

/** A step range an LLM proposes: `lines` is `[first, last]`, 1-based and inclusive. */
export interface ProposedAlignment { step: string; lines: number[]; why: string }

/** The proposed ranges that pass (the step exists, the range lies within the function, every backticked identifier in `why` occurs in it) as proposed steps, and why the others were dropped. */
export function checkAlignment(proposed: ProposedAlignment[], steps: SpecStep[], fn: { line: number; end: number }, lines: string[]): { steps: EngineStep[]; dropped: string[] } {
  const known = new Set(steps.map((step) => step.number));
  const kept: EngineStep[] = [];
  const dropped: string[] = [];
  for (const { step, lines: range, why } of proposed) {
    if (!known.has(step)) { dropped.push(`Step ${step} does not exist`); continue; }
    const [from, to] = range as [number, number];
    if (range.length !== 2 || from > to || from < fn.line || to > fn.end) { dropped.push(`Step ${step}: lines ${range.join("-")} are not a range within the function (${fn.line}-${fn.end})`); continue; }
    const code = lines.slice(from - 1, to).join("\n");
    const missing = [...why.matchAll(/`([^`]+)`/g)].map((match) => match[1]!).filter((identifier) => !code.includes(identifier));
    if (missing.length) { dropped.push(...missing.map((identifier) => `Step ${step} names \`${identifier}\`, which lines ${from}-${to} do not contain`)); continue; }
    kept.push({ step, line: from, end: to, quote: lines[from - 1] ?? "", verdict: "proposed", detail: why, origin: "align" });
  }
  return { steps: kept, dropped };
}
