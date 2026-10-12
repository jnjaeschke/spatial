import type { SpecStep } from "./steps.ts";

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

/**
 * The step a Step comment numbered `own` clearly describes when that is another step (a stale number), else null.
 * webspec-index's mismatches include ranges ("to step 1.3"), explanations and relative numbering, so only a clear match counts.
 */
export function describedStep(comment: string, own: string, steps: SpecStep[]): SpecStep | null {
  const commentWords = words(comment);
  if (commentWords.size < 2) return null;
  const step = steps.find((item) => item.number === own);
  let other: SpecStep | null = null;
  let best = Math.max(CLEARLY_DESCRIBES, (step ? overlap(commentWords, step) : 0) + MARGIN);
  for (const item of steps) {
    const score = overlap(commentWords, item);
    if (item !== step && score >= best) { other = item; best = score; }
  }
  return other;
}
