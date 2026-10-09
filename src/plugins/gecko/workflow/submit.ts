import type { Artifact, DecisionData, Epoch, Phase, Step, WorkflowView } from "../../../plugin-api.ts";
import type { PhabSubmissionData, PhabSubmitInput, ReviewerSuggestionData, SubmitInput } from "../shared/types.ts";
import { REVIEWERS_PATTERN } from "../runtime/submit-command.ts";

/** The Submit decision's question; it names the tip, because a submit started from chat sends whatever HEAD was then. */
export const submitQuestion = (commits: number, head: string) => `Submit ${commits} commit${commits === 1 ? "" : "s"} (${head.slice(0, 12)}) to Phabricator?`;

/** After a `submit` epoch: ask Submit / Submit as WIP (reviewers editable) / Not yet; a submit runs `phabSubmit` once. */
export function submitNext(view: WorkflowView, epoch: Epoch): Step | null {
  const suggestion = view.artifacts.findLast((a) => a.type === "ReviewerSuggestion" && a.epoch === epoch.n) as Artifact<ReviewerSuggestionData> | undefined;
  if (!suggestion) return null;
  const { base, head } = epoch.input as SubmitInput, question = submitQuestion(suggestion.data.commits, head);
  const chosen = (view.artifacts.findLast((a) => a.type === "Decision" && a.epoch === epoch.n && (a.data as DecisionData).question === question && (a.data as DecisionData).chosen) as Artifact<DecisionData> | undefined)?.data.chosen;
  const reviewers = suggestion.data.suggested.join(", ");
  const text = { takesText: true, textPattern: REVIEWERS_PATTERN, ...(reviewers ? { defaultText: reviewers } : {}) };
  if (!chosen) return { decide: { question, options: [{ id: "submit", label: "Submit", ...text }, { id: "wip", label: "Submit as WIP", ...text }, { id: "skip", label: "Not yet" }] } };
  if (chosen.option === "skip" || view.epochs.some((e) => e.phase === "phabSubmit" && e.n > epoch.n)) return null;
  const input: PhabSubmitInput = { base, head, reviewers: (chosen.text ?? "").trim(), wip: chosen.option === "wip" };
  return { run: "phabSubmit", input };
}

export const submitPhase: Phase<SubmitInput> = { id: "submit", async run(rt, sessionId, input) { await rt.run(sessionId, "suggestReviewers", { base: input.base, head: input.head }); }, next: submitNext };

export const phabSubmitPhase: Phase<PhabSubmitInput> = {
  id: "phabSubmit",
  async run(rt, sessionId, input) {
    const { submissionId } = await rt.run<{ submissionId: string }>(sessionId, "phabSubmit", input);
    // The review plugin syncs revisions named by trailers in the latest Diff; submitted commits carry those trailers.
    const head = rt.store.getArtifact<PhabSubmissionData>(submissionId).data.head;
    await rt.run(sessionId, "importDiff", { base: input.base, head });
  },
};
