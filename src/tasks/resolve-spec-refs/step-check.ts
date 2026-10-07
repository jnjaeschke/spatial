import type { SpecStep } from "../../shared/spec-text.ts";
import type { ReviewFindingData } from "../../shared/types.ts";
import type { StepComment } from "./cited.ts";

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
 * Checks a `Step N` comment against the steps of the section its URL resolved to (`spec` is `SPEC#anchor`).
 * Gecko code often paraphrases steps or numbers them relative to a nested algorithm, so only two cases are reported:
 * the comment text clearly describes another step (a stale number), or step N does not exist.
 */
export function checkStepComment(comment: StepComment, spec: string, steps: SpecStep[]): StepProblem | null {
  const commentWords = words(comment.text);
  const step = steps.find((item) => item.number === comment.number);
  let other: SpecStep | null = null;
  if (commentWords.size >= 2) {
    let best = Math.max(CLEARLY_DESCRIBES, (step ? overlap(commentWords, step) : 0) + MARGIN);
    for (const item of steps) {
      const score = overlap(commentWords, item);
      if (item !== step && score >= best) { other = item; best = score; }
    }
  }
  if (step && !other) return null;
  const said = `The comment says: “${comment.text}”`;
  const own = step ? `Step ${step.number} says: “${step.text}”` : `The algorithm has steps 1–${steps.findLast((item) => item.depth === 0)?.number}.`;
  const snapshot = comment.url.includes("/commit-snapshots/") ? "\n\nThe comment links a spec snapshot; the check compared the current spec." : "";
  if (other) return { severity: "medium", title: `Step ${comment.number} comment describes step ${other.number} of ${spec}`, body: `${said}\n\nThat is step ${other.number}: “${other.text}” ${own}${snapshot}` };
  return { severity: "low", title: `Comment cites step ${comment.number}, which ${spec} does not have`, body: `${said}\n\n${own}${snapshot}` };
}
