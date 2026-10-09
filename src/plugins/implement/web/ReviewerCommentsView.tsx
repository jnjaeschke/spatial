import { useState } from "react";
import type { PhaseViewProps } from "../../../web/plugin-api.ts";
import { api, Composer, ErrorText, useAction } from "../../../web/plugin-api.ts";
import { commentPlan, type CommentPlanItem } from "../shared/comment-plan.ts";
import type { CommentAction } from "../shared/types.ts";
import { RunStatus } from "./RunStatus.tsx";

function CommentItem({ sessionId, item, readOnly }: { sessionId: string; item: CommentPlanItem; readOnly: boolean }) {
  const c = item.comment.data;
  const [action, setAction] = useState<CommentAction>(item.action);
  const [text, setText] = useState(item.text ?? "");
  const { error, run } = useAction();
  const save = (next: CommentAction, value: string) => run(() => api.triageComment(sessionId, item.comment.id, next, value.trim() || undefined));
  return <li className="reviewer-comment" data-testid="reviewer-comment" data-action={item.action}>
    <div className="reviewer-comment-head"><strong>{c.author}</strong> on D{c.revision}{c.path !== undefined && c.line !== undefined ? <> · <code>{c.path}:{c.line}</code></> : " · general comment"}</div>
    {c.quote !== undefined && <pre className="reviewer-comment-quote">{c.quote}</pre>}
    <p>{c.body}</p>
    {item.interpretation && <div className="reviewer-comment-ai">
      <p data-testid="comment-asks"><b>Asks:</b> {item.interpretation.data.asks}</p>
      <p data-testid="comment-proposal"><b>Proposal:</b> {item.interpretation.data.proposal}</p>
    </div>}
    {!readOnly && <div className="reviewer-comment-controls">
      {(["address", "reply", "ignore"] as const).map((option) => <button key={option} type="button" aria-pressed={action === option} onClick={() => { setAction(option); void save(option, text); }}>{option[0]!.toUpperCase() + option.slice(1)}</button>)}
      {action !== "ignore" && <Composer label="comment text" placeholder={action === "reply" ? "Reply (posted as a draft inline)" : "Note for the implement agent"} value={text} onChange={setText} canSubmit={!!text.trim()} onSubmit={() => void save(action, text)} />}
      {action !== "ignore" && <button type="button" onClick={() => void save(action, text)}>Save</button>}
      <ErrorText error={error} />
    </div>}
  </li>;
}

/** A `reviewerComments` epoch: each reviewer comment with its private interpretation and the user's mark; the Work in decision is in the top bar. */
export function ReviewerCommentsView({ state, epoch, readOnly = false }: PhaseViewProps) {
  const [result, setResult] = useState<string | null>(null);
  if (!epoch) return null;
  const items = commentPlan(state, epoch);
  const replies = items.filter((item) => item.action === "reply" && item.text).length;
  return <div className="session-body"><div className="reviewer-comments-panel">
    <RunStatus sessionId={state.session.id} epoch={epoch} readOnly={readOnly} />
    {epoch.status === "running" && <p className="running">Reading the reviewer comments…</p>}
    {/* The text box is seeded from the interpretation, which can arrive after the comment shows: remount then. */}
    <ul className="reviewer-comments">{items.map((item) => <CommentItem key={`${item.comment.data.phid}:${item.interpretation?.id ?? ""}`} sessionId={state.session.id} item={item} readOnly={readOnly} />)}</ul>
    {!readOnly && replies > 0 && <button type="button" data-testid="post-replies" onClick={() => api.postReplies(state.session.id).then((r) => setResult(`Posted ${r.posted} draft repl${r.posted === 1 ? "y" : "ies"}${r.skipped.length ? `; skipped ${r.skipped.length}: ${r.skipped.map((s) => s.reason).join("; ")}` : ""}`), (e: Error) => setResult(e.message))}>Post {replies} repl{replies === 1 ? "y" : "ies"} as Phabricator drafts</button>}
    {result && <p data-testid="post-replies-result">{result}</p>}
  </div></div>;
}
