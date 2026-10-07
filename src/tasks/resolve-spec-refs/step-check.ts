import type { SpecStep } from "../../shared/spec-text.ts";
import type { ReviewFindingData } from "../../shared/types.ts";
import type { StepCommentCheck } from "../../runtime/tasks.ts";

const STOP_WORDS = new Set(["the", "and", "then", "this", "that", "with", "for", "from", "its", "are", "was", "has", "have", "into", "than", "which", "otherwise"]);
const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 3 && !STOP_WORDS.has(word)));
/** Share of the comment's words that occur in the step text. */
const overlap = (comment: Set<string>, step: SpecStep) => {
  const own = words(step.text);
  return [...comment].filter((word) => own.has(word)).length / comment.size;
};

/** A comment sharing this much with another step, and `MARGIN` more than with its own, is that step's comment. */
const CLEARLY_DESCRIBES = 0.8;
const MARGIN = 0.3;

export type StepProblem = Pick<ReviewFindingData, "severity" | "title" | "body">;

/**
 * Turns webspec-index's verdict on a Step comment into a finding (`spec` is `SPEC#anchor`, `steps` its algorithm).
 * Its mismatches include ranges ("to step 1.3"), explanations and relative numbering, so a mismatch is reported only
 * when the comment text clearly describes another step (a stale number); a step the algorithm lacks is always reported.
 */
export function checkStepComment(check: StepCommentCheck, spec: string, steps: SpecStep[]): StepProblem | null {
  if (check.result === "exact" || check.result === "fuzzy") return null;
  const commentWords = words(check.text);
  const step = steps.find((item) => item.number === check.step);
  let other: SpecStep | null = null;
  if (commentWords.size >= 2) {
    let best = Math.max(CLEARLY_DESCRIBES, (step ? overlap(commentWords, step) : 0) + MARGIN);
    for (const item of steps) {
      const score = overlap(commentWords, item);
      if (item !== step && score >= best) { other = item; best = score; }
    }
  }
  if (check.result === "mismatch" && !other) return null;
  const said = `The comment says: “${check.text}”`;
  const own = step ? `Step ${step.number} says: “${step.text}”` : `The algorithm has steps 1–${steps.findLast((item) => item.depth === 0)?.number}.`;
  const snapshot = check.url.includes("/commit-snapshots/") ? "\n\nThe comment links a spec snapshot; the check compared the current spec." : "";
  if (other) return { severity: "medium", title: `Step ${check.step} comment describes step ${other.number} of ${spec}`, body: `${said}\n\nThat is step ${other.number}: “${other.text}” ${own}${snapshot}` };
  return { severity: "low", title: `Comment cites step ${check.step}, which ${spec} does not have`, body: `${said}\n\n${own}${snapshot}` };
}
