import { defineTask, runChecked, type Id } from "../../../../plugin-api.ts";
import type { ReviewerSuggestionData, SubmitInput } from "../../shared/types.ts";
import { parseReviewerJson } from "../../runtime/submit-command.ts";
import { changedFiles } from "../../runtime/changed-files.ts";


/** Asks `./mach file-info reviewers` for the changed files; a failure is kept in the artifact, it does not fail the phase, because the user can still type reviewers. */
export const suggestReviewers = defineTask<SubmitInput, { suggestionId: Id }>({
  kind: "suggestReviewers",
  async run(ctx, { base, head }) {
    const [diff, commits] = await Promise.all([ctx.git.diff(base, head), ctx.git.log(base, head)]);
    const files = changedFiles(diff);
    let data: ReviewerSuggestionData = { files, commits: commits.length, suggested: [], candidates: [], error: null };
    try {
      const out = await runChecked("./mach", ["file-info", "reviewers", "--format", "json", ...files], { stdin: "", cwd: ctx.repo, signal: ctx.signal, label: "./mach file-info reviewers", tail: 500 });
      data = { ...data, ...parseReviewerJson(out.stdout) };
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      data = { ...data, error: (e as Error).message };
    }
    return { suggestionId: ctx.artifacts.put<ReviewerSuggestionData>("ReviewerSuggestion", "verified", data).id };
  },
});
