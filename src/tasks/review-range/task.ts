import { defineTask } from "../../runtime/tasks.ts";
import { defaultReviewRange } from "../../workflows/review-range.ts";

export const reviewRange = defineTask<Record<string, never>, { base: string; head: string }>({
  kind: "reviewRange",
  run: (ctx) => defaultReviewRange(ctx.repo, ctx.git),
});
