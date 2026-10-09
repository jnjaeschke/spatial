import { useEffect, useRef, useState } from "react";
import type { ReviewSubmissionData } from "../shared/types.ts";
import { api, Box, type Id, Composer, ErrorText, useAction } from "../../../web/plugin-api.ts";
import type { SummaryNodeData } from "./graph.ts";

const actionLabel = (action: ReviewSubmissionData["action"]) => action === "accept" ? "accepted" : action === "request-changes" ? "requested changes" : "commented";
const actionPhrase = (action: ReviewSubmissionData["action"]) => action === "accept" ? "and accept the revision" : action === "request-changes" ? "and request changes" : "and comment on the revision";

export function ReviewPanel({ sessionId, review }: { sessionId: Id; review: SummaryNodeData["reviews"][number] }) {
  const [body, setBody] = useState(review.body);
  const [action, setAction] = useState<ReviewSubmissionData["action"]>("comment");
  const { error, run, clear } = useAction();
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (body === review.body) return;
    void run(() => api.saveReviewDraft(sessionId, review.revision, body));
  };
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [body, review.revision]);

  const submit = async () => {
    clear();
    void run(async () => {
      await api.submitReview(sessionId, { revision: review.revision, action, body });
      setBody("");
      await api.saveReviewDraft(sessionId, review.revision, "");
    });
  };

  return <Box nested kind="review" testId={`review-panel-D${review.revision}`} title={`Review D${review.revision}`} collapse={{ key: `review:${review.revision}`, label: `review D${review.revision}` }}>
    <p>{review.comments.length} inline comment{review.comments.length === 1 ? "" : "s"} pending</p>
    <label onBlur={save}>General comment<Composer label="General comment" value={body} onChange={setBody} canSubmit onSubmit={() => { save(); clear(); dialog.current?.showModal(); }} /></label>
    <label>Action<select aria-label="review action" value={action} onChange={(event) => setAction(event.target.value as ReviewSubmissionData["action"])}>
      <option value="comment">Comment</option><option value="accept">Accept</option><option value="request-changes">Request changes</option>
    </select></label>
    <button className="review-submit nodrag" onClick={() => { clear(); dialog.current?.showModal(); }}>Submit to D{review.revision}…</button>
    <dialog ref={dialog} className="review-confirmation">
      <h3>Submit review to D{review.revision}?</h3>
      <ul>{review.comments.map((comment, index) => <li key={`${comment.path}:${comment.line}:${index}`}><strong>{comment.path}:{comment.line}</strong> — {comment.body.split("\n", 1)[0]}</li>)}</ul>
      {body && <p className="review-general-preview">General comment: {body}</p>}
      <p>{actionPhrase(action)}</p>
      <footer><button type="button" onClick={() => dialog.current?.close()}>Cancel</button><button type="button" onClick={() => { dialog.current?.close(); void submit(); }}>Confirm</button></footer>
    </dialog>
    {review.submissions.map((submission) => <p className="review-result" key={submission.id}>Submitted to D{submission.data.revision}: {submission.data.inlines} inline comment{submission.data.inlines === 1 ? "" : "s"}, {actionLabel(submission.data.action)}</p>)}
    <ErrorText error={error} />
  </Box>;
}
