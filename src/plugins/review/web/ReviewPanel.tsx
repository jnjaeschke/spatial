import { reviewClient } from "./client.ts";
import { useEffect, useRef, useState } from "react";
import type { ReviewSubmissionData } from "../shared/types.ts";
import { Box, type Id, Composer, Dialog, ErrorText, useAction } from "../../../web/plugin-api.ts";
import type { SummaryNodeData } from "./graph.ts";
import { mergeServerDraft } from "../shared/postable-comments.ts";

const actionLabel = (action: ReviewSubmissionData["action"]) => action === "accept" ? "accepted" : action === "request-changes" ? "requested changes" : "commented";
const actionPhrase = (action: ReviewSubmissionData["action"]) => action === "accept" ? "and accept the revision" : action === "request-changes" ? "and request changes" : "and comment on the revision";

export function ReviewPanel({ sessionId, review }: { sessionId: Id; review: SummaryNodeData["reviews"][number] }) {
  const [body, setBody] = useState(review.body);
  const [action, setAction] = useState<ReviewSubmissionData["action"]>("comment");
  const { error, run, clear } = useAction();
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const serverBody = useRef(review.body);
  useEffect(() => {
    const previous = serverBody.current;
    serverBody.current = review.body;
    if (review.body !== previous) setBody((current) => mergeServerDraft(current, previous, review.body));
  }, [review.body]);

  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (body === review.body) return;
    serverBody.current = body;
    void run(() => reviewClient.saveReviewDraft(sessionId, review.revision, body));
  };
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [body, review.revision]);

  const submit = async () => {
    clear();
    void run(async () => {
      await reviewClient.submitReview(sessionId, { revision: review.revision, action, body });
      setBody("");
      serverBody.current = "";
      await reviewClient.saveReviewDraft(sessionId, review.revision, "");
    });
  };

  return <Box nested kind="review" testId={`review-panel-D${review.revision}`} title={`Review D${review.revision}`} collapse={{ key: `review:${review.revision}`, label: `review D${review.revision}` }}>
    <p>{review.comments.length} inline comment{review.comments.length === 1 ? "" : "s"} pending</p>
    <label className="field field-stacked" onBlur={save}><span className="field-label">General comment</span><Composer label="General comment" value={body} onChange={setBody} canSubmit onSubmit={() => { save(); clear(); setConfirming(true); }} /></label>
    <label className="field field-stacked"><span className="field-label">Action</span><select aria-label="review action" value={action} onChange={(event) => setAction(event.target.value as ReviewSubmissionData["action"])}>
      <option value="comment">Comment</option><option value="accept">Accept</option><option value="request-changes">Request changes</option>
    </select></label>
    <button className="review-submit nodrag" onClick={() => { clear(); setConfirming(true); }}>Submit to D{review.revision}…</button>
    {confirming && <Dialog title={`Submit review to D${review.revision}?`} onClose={() => setConfirming(false)} className="review-confirmation" footer={<><button type="button" onClick={() => setConfirming(false)}>Cancel</button><button type="button" onClick={() => { setConfirming(false); void submit(); }}>Confirm</button></>}>
      <ul>{review.comments.map((comment, index) => <li key={`${comment.path}:${comment.line}:${index}`}><strong>{comment.path}:{comment.line}</strong> — {comment.body.split("\n", 1)[0]}</li>)}</ul>
      {body && <p className="review-general-preview">General comment: {body}</p>}
      <p>{actionPhrase(action)}</p>
    </Dialog>}
    {review.submissions.map((submission) => <p className="review-result" key={submission.id}>Submitted to D{submission.data.revision}: {submission.data.inlines} inline comment{submission.data.inlines === 1 ? "" : "s"}, {actionLabel(submission.data.action)}</p>)}
    <ErrorText error={error} />
  </Box>;
}
