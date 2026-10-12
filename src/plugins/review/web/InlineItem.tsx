import { useContext } from "react";
import type { ChangeNodeData, FindingData, PhabThreadData } from "./graph.ts";
import { ChatItem as InlineChat, CollapseContext, InlineItem, type HostedThread } from "../../../web/plugin-api.ts";
import { DetailsContext } from "./details.ts";
import { plainText } from "../../../web/plugin-api.ts";
import { commentId } from "./CommentDetails.tsx";
import { FindingBody } from "./FindingDetails.tsx";
import { PhabBody } from "./PhabDetails.tsx";
import { UserCommentBox } from "./UserCommentBox.tsx";
import { SpecLinkContext, SpecMarkdown } from "../../spec/web/api.ts";

/** A chat thread; ⤢ opens it in the review's side panel. */
export function ChatItem({ thread }: { thread: HostedThread }) {
  const details = useContext(DetailsContext);
  return <InlineChat thread={thread} onOpenPanel={() => details?.open({ kind: "chat", id: thread.threadId ?? thread.draftId! })} />;
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
  const links = useContext(SpecLinkContext);
  const specLinks = links && { follow: async (ref: string, _step: string | null) => { details?.open({ kind: "spec", specId }); await links.follow(ref, null); } };
  return <SpecLinkContext.Provider value={specLinks}><InlineItem kind="spec" id={specId} who="Spec" text={`${title} — ${plainText(text)}`} testId={`spec-chip-${specId}`} body={<div className="spec-section-text"><SpecMarkdown text={text} /></div>} onOpenPanel={() => details?.open({ kind: "spec", specId })} /></SpecLinkContext.Provider>;
}
