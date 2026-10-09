import { useEffect, useRef, useState } from "react";
import type { ReviewSubmissionData } from "../shared/types.ts";
import { api } from "../../../web/plugin-api.ts";
import type { Id } from "../../../web/plugin-api.ts";
import type { SummaryNodeData } from "./graph.ts";

const actionLabel = (action: ReviewSubmissionData["action"]) => action === "accept" ? "accepted" : action === "request-changes" ? "requested changes" : "commented";
const actionPhrase = (action: ReviewSubmissionData["action"]) => action === "accept" ? "and accept the revision" : action === "request-changes" ? "and request changes" : "and comment on the revision";

export function ReviewPanel({ sessionId, review }: { sessionId: Id; review: SummaryNodeData["reviews"][number] }) {
  const [body, setBody] = useState(review.body);
  const [action, setAction] = useState<ReviewSubmissionData["action"]>("comment");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (body === review.body) return;
    void api.saveReviewDraft(sessionId, review.revision, body).catch((e: Error) => setError(e.message));
  };
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [body, review.revision]);

  const submit = async () => {
    setError("");
    setResult("");
    try {
      const submitted = await api.submitReview(sessionId, { revision: review.revision, action, body });
      setResult(`Submitted to D${review.revision}: ${submitted.inlines} inline comment${submitted.inlines === 1 ? "" : "s"}, ${actionLabel(action)}`);
      setBody("");
      await api.saveReviewDraft(sessionId, review.revision, "");
    } catch (e) { setError((e as Error).message); }
  };

  return <section className="review-panel" data-testid={`review-panel-D${review.revision}`}>
    <h4>Review D{review.revision}</h4>
    <p>{review.comments.length} inline comment{review.comments.length === 1 ? "" : "s"} pending</p>
    <label>General comment<textarea aria-label="General comment" value={body} onChange={(event) => setBody(event.target.value)} onBlur={save} /></label>
    <label>Action<select aria-label="review action" value={action} onChange={(event) => setAction(event.target.value as ReviewSubmissionData["action"])}>
      <option value="comment">Comment</option><option value="accept">Accept</option><option value="request-changes">Request changes</option>
    </select></label>
    <button className="review-submit nodrag" onClick={() => { setError(""); dialog.current?.showModal(); }}>Submit to D{review.revision}…</button>
    <dialog ref={dialog} className="review-confirmation">
      <h3>Submit review to D{review.revision}?</h3>
      <ul>{review.comments.map((comment, index) => <li key={`${comment.path}:${comment.line}:${index}`}><strong>{comment.path}:{comment.line}</strong> — {comment.body.split("\n", 1)[0]}</li>)}</ul>
      {body && <p className="review-general-preview">General comment: {body}</p>}
      <p>{actionPhrase(action)}</p>
      <footer><button type="button" onClick={() => dialog.current?.close()}>Cancel</button><button type="button" onClick={() => { dialog.current?.close(); void submit(); }}>Confirm</button></footer>
    </dialog>
    {result && <p className="review-result" role="status">{result}</p>}
    {review.submissions.map((submission) => <p className="review-result" key={submission.id}>Submitted to D{submission.data.revision}: {submission.data.inlines} inline comment{submission.data.inlines === 1 ? "" : "s"}, {actionLabel(submission.data.action)}</p>)}
    {error && <p className="review-error" role="alert">{error}</p>}
  </section>;
}
