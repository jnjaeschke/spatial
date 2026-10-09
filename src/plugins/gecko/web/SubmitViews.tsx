import type { Artifact, PhaseViewProps } from "../../../web/plugin-api.ts";
import { ErrorText } from "../../../web/plugin-api.ts";
import { PhaseShell } from "../../implement/web/api.ts";
import type { PhabSubmissionData, ReviewerSuggestionData } from "../shared/types.ts";

/** A `submit` epoch: the suggested reviewers and recent candidates; the Submit decision is in the top bar. */
export function SubmitView({ state, epoch, readOnly = false }: PhaseViewProps) {
  const suggestion = (state.artifacts.findLast((a) => a.type === "ReviewerSuggestion" && a.epoch === epoch?.n) as Artifact<ReviewerSuggestionData> | undefined)?.data;
  return <PhaseShell state={state} epoch={epoch} readOnly={readOnly} running={epoch?.status === "running" ? "Looking up reviewers…" : null}>
    {suggestion && <div className="try-proposal" data-testid="reviewer-suggestion">
      <p>{suggestion.commits} commit{suggestion.commits === 1 ? "" : "s"}, {suggestion.files.length} file{suggestion.files.length === 1 ? "" : "s"}. Suggested reviewers: {suggestion.suggested.length ? <code>{suggestion.suggested.join(", ")}</code> : "none"}</p>
      {suggestion.candidates.length > 0 && <p>Recent reviewers of these files: {suggestion.candidates.map((c) => <span key={c.name} data-testid="reviewer-candidate"><code>{c.name}</code> ({c.count}) </span>)}</p>}
      <ErrorText error={suggestion.error} testId="reviewer-error" />
    </div>}
  </PhaseShell>;
}

/** A `phabSubmit` epoch: the moz-phab output and a link per submitted commit. */
export function PhabSubmitView({ state, epoch, readOnly = false }: PhaseViewProps) {
  const submission = (state.artifacts.findLast((a) => a.type === "PhabSubmission" && a.epoch === epoch?.n) as Artifact<PhabSubmissionData> | undefined)?.data;
  return <PhaseShell state={state} epoch={epoch} readOnly={readOnly} running={epoch?.status === "running" ? "Submitting to Phabricator… (moz-phab output in the activity strip)" : null}>
    {submission && <ul className="try-run" data-testid="phab-submission">{submission.revisions.map((r) => <li key={r.sha}>{r.subject}: <a data-testid="phab-revision" href={r.url} target="_blank" rel="noreferrer">{r.url.replace(/^https?:\/\/[^/]+\//, "")}</a></li>)}</ul>}
  </PhaseShell>;
}
