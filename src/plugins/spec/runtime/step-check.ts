import { basename } from "node:path";
import type { SpecStep } from "../shared/steps.ts";
import type { StepLink } from "../shared/types.ts";
import type { StepCommentCheck, WebspecCapability } from "./webspec.ts";
import { describedStep } from "../shared/step-comments.ts";

export type StepProblem = { severity: "high" | "medium" | "low"; title: string; body: string };

/** A line that may be a Step comment (`// Step 3.`, `// 3.1 ...`); files without one on an added line skip `webspec-index analyze`. */
const STEP_LIKE = /^\s*(?:\/\/+|\/?\*+|#)\s*(?:step\s+)?\d+(?:\.\d+)*[.:)]?(?:\s|$)/i;

/** webspec-index's checks of a file's Step comments; none (and no analysis) unless an `added` line (1-based) looks like one. */
export async function stepComments(webspec: WebspecCapability, path: string, text: string, added: Iterable<number>, signal: AbortSignal): Promise<StepCommentCheck[]> {
  const lines = text.split("\n");
  if (![...added].some((line) => STEP_LIKE.test(lines[line - 1] ?? ""))) return [];
  return webspec.analyze(basename(path), text, signal);
}

/** The lines a Step comment on `line` describes: itself and following lines up to a blank line, the next Step comment, a line indented less than the comment, or 20 lines. */
export function commentBlock(lines: string[], line: number, commentLines: Set<number>): number[] {
  const start = line - 1;
  const indent = /^\s*/.exec(lines[start] ?? "")![0].length;
  const result = [line];
  for (let index = start + 1; index < lines.length && result.length < 20; index++) {
    const text = lines[index]!;
    if (!text.trim() || commentLines.has(index + 1) || /^\s*/.exec(text)![0].length < indent) break;
    result.push(index + 1);
  }
  return result;
}

const said = (check: StepCommentCheck) => `The comment says: “${check.text}”`;
const own = (check: StepCommentCheck, steps: SpecStep[]) => {
  const step = steps.find((item) => item.number === check.step);
  return step ? `Step ${step.number} says: “${step.text}”` : `The algorithm has steps 1–${steps.findLast((item) => item.depth === 0)?.number}.`;
};
const snapshot = (check: StepCommentCheck) => check.url.includes("/commit-snapshots/") ? "\n\nThe comment links a spec snapshot; the check compared the current spec." : "";

const related = (a: string, b: string) => a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

/** A Step comment whose block the step map links only to unrelated steps (neither step N, its substeps nor its ancestors); `covering` are the links covering the block's new-side lines. */
export function misplacedStepComment(check: StepCommentCheck, spec: string, steps: SpecStep[], covering: StepLink[]): StepProblem | null {
  if (covering.length === 0 || covering.some((link) => related(link.step, check.step))) return null;
  const unrelated = covering[0]!;
  const mapped = steps.find((step) => step.number === unrelated.step)?.text ?? "";
  return { severity: "medium", title: `Step ${check.step} comment sits on code mapped to step ${unrelated.step} of ${spec}`, body: `${said(check)}\n\nThe step map links the code below it to step ${unrelated.step}: “${mapped}” (${unrelated.note})\n\n${own(check, steps)}${snapshot(check)}` };
}

/**
 * Turns webspec-index's verdict on a Step comment into a finding (`spec` is `SPEC#anchor`, `steps` its algorithm): a mismatch
 * only when the comment text clearly describes another step (`describedStep`); a step the algorithm lacks is always reported.
 */
export function checkStepComment(check: StepCommentCheck, spec: string, steps: SpecStep[]): StepProblem | null {
  if (check.result === "exact" || check.result === "fuzzy") return null;
  const other = describedStep(check.text, check.step, steps);
  if (check.result === "mismatch" && !other) return null;
  const comment = said(check), described = own(check, steps), snapshotNote = snapshot(check);
  if (other) return { severity: "medium", title: `Step ${check.step} comment describes step ${other.number} of ${spec}`, body: `${comment}\n\nThat is step ${other.number}: “${other.text}” ${described}${snapshotNote}` };
  return { severity: "low", title: `Comment cites step ${check.step}, which ${spec} does not have`, body: `${comment}\n\n${described}${snapshotNote}` };
}
