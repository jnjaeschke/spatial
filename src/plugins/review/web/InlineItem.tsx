import { useContext, type ReactNode } from "react";
import type { ChangeNodeData, FindingData, PhabThreadData } from "./graph.ts";
import { IconButton, ChatActionsContext, ClosedContext, CollapseContext, closeChat, type HostedThread } from "../../../web/plugin-api.ts";
import { DetailsContext } from "./details.ts";
import { useInlineState } from "./inline-state.ts";
import { plainText } from "./plain-text.ts";
import { ChatBody } from "./ChatDetails.tsx";
import { commentId } from "./CommentDetails.tsx";
import { FindingBody } from "./FindingDetails.tsx";
import { PhabBody } from "./PhabDetails.tsx";
import { UserCommentBox } from "./UserCommentBox.tsx";

type Kind = "chat" | "comment" | "finding" | "phab" | "spec";

/** An item of the review shown where it applies, as a line, a preview or its whole body; `onOpenPanel` shows it in the side panel. */
export function InlineItem({ kind, id, who, count, text, badges, dimmed, severity, body, onOpenPanel, onClose, testId }: { kind: Kind; id: string; who: string; count?: number; text: string; badges?: ReactNode; dimmed?: boolean; severity?: string; body: ReactNode; onOpenPanel(): void; onClose?(): void; testId: string }) {
  const [state, setState] = useInlineState(id);
  const expanded = state === "expanded";
  const open = () => setState("expanded");
  const toggle = () => setState(state === "preview" ? "line" : "preview");
  const head = <><span className="inline-who">{who}</span>{badges}{count !== undefined && count > 0 && <small className="inline-count">{count}</small>}</>;
  return <div className={`inline-item nodrag nopan kind-${kind}${severity ? ` severity-${severity}` : ""}${dimmed ? " dismissed" : ""} state-${state}`} data-testid={testId} data-state={state} onDoubleClick={(event) => event.stopPropagation()}>
    <div className="inline-head">
      {head}
      {state === "line" && <button type="button" className="inline-text" onClick={open}>{text}</button>}
      <span className="inline-actions">
        <IconButton label={expanded ? "Collapse item" : state === "line" ? "Show preview" : "Show as line"} type="button" className="link-button" aria-expanded={expanded} onClick={toggle}>{expanded ? "▴" : state === "preview" ? "▾" : "▸"}</IconButton>
        <IconButton label="Open in side panel" type="button" className="link-button" onClick={onOpenPanel}>⤢</IconButton>
        {onClose && <IconButton label="Close chat" type="button" className="link-button" onClick={onClose}>×</IconButton>}
      </span>
    </div>
    {state === "preview" && <button type="button" className="inline-text inline-preview" onClick={open}>{text}</button>}
    {expanded && <div className="inline-body">{body}</div>}
  </div>;
}

/** A chat thread; a new draft shows its composer. */
export function ChatItem({ thread }: { thread: HostedThread }) {
  const details = useContext(DetailsContext);
  const actions = useContext(ChatActionsContext);
  const closed = useContext(ClosedContext);
  const id = thread.threadId ?? thread.draftId!;
  const last = thread.messages.at(-1);
  return <InlineItem kind="chat" id={id} who={last?.data.role === "assistant" ? "AI" : "You"} count={thread.messages.length} text={last ? plainText(last.data.text) : "New chat"} testId={`chat-chip-${id}`} body={<div data-testid={`chat-${id}`}><ChatBody thread={thread} /></div>} onOpenPanel={() => details?.open({ kind: "chat", id })} onClose={() => closeChat(thread.threadId, thread.draftId, actions, closed)} />;
}

/** A user comment on diff lines, saved or still a draft. */
export function UserCommentItem({ item, diffId }: { item: ChangeNodeData["comments"][number]; diffId: string }) {
  const details = useContext(DetailsContext);
  const id = commentId(item);
  return <InlineItem kind="comment" id={id} who="You" text={item.artifact ? plainText(item.artifact.data.body) : "New comment"} testId={`comment-chip-${id}`} body={<UserCommentBox item={item} diffId={diffId} />} onOpenPanel={() => details?.open({ kind: "comment", id })} />;
}

/** A finding; a dismissed one is dimmed. */
export function FindingItem({ finding }: { finding: FindingData }) {
  const details = useContext(DetailsContext);
  return <InlineItem kind="finding" id={finding.findingId} who={`${finding.severity} · ${finding.ai ? "AI review" : "spec check"}`} count={finding.thread?.messages.length} severity={finding.severity} dimmed={finding.decision === "dismissed"} text={`${finding.title} — ${plainText(finding.body)}`} testId={`finding-chip-${finding.findingId}`} body={<FindingBody data={finding} />} onOpenPanel={() => details?.open({ kind: "finding", id: finding.findingId })} />;
}

/** A Phabricator thread of a change, a hunk line or the summary. */
export function PhabItem({ thread }: { thread: PhabThreadData }) {
  const details = useContext(DetailsContext);
  const collapse = useContext(CollapseContext);
  const last = thread.comments.at(-1)!.data;
  const who = [...new Set(thread.comments.map((comment) => `@${comment.data.author}`))].join(", ");
  return <InlineItem kind="phab" id={thread.anchorId} who={who} count={thread.comments.length} badges={thread.summary && <span className="badge phab-summary-badge">AI summary</span>} dimmed={thread.done} text={thread.summary ? plainText(thread.summary) : `@${last.author}: ${plainText(last.body)}`} testId={`phab-chip-${thread.anchorId}`} body={<PhabBody data={thread} reveal={collapse?.reveal ?? (() => {})} />} onOpenPanel={() => details?.open({ kind: "phab", anchorId: thread.anchorId })} />;
}

/** A spec section a change supports; expanded it shows the section text. */
export function SpecItem({ specId, title, text }: { specId: string; title: string; text: string }) {
  const details = useContext(DetailsContext);
  return <InlineItem kind="spec" id={specId} who="Spec" text={`${title} — ${plainText(text)}`} testId={`spec-chip-${specId}`} body={<p className="spec-section-text">{text}</p>} onOpenPanel={() => details?.open({ kind: "spec", specId })} />;
}
