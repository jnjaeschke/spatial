import { reviewClient } from "./client.ts";
import { Fragment, useContext, useState, type SyntheticEvent } from "react";
import { ChatActionsContext, CollapseContext, Composer, Conversation, ErrorText, SidePanel, useAction, useDraftText, type ChatActions, type Graph } from "../../../web/plugin-api.ts";
import { isReviewKind, phabCommentCollapseId, type PhabThreadData } from "./graph.ts";
import { PhabComment } from "./PhabComment.tsx";
import { UserCommentBox } from "./UserCommentBox.tsx";

/** Finds the Phabricator thread of a phab detail among the threads hosted by changes, hunks and the summary. */
export function findPhabThread(graph: Graph | null, anchorId: string): PhabThreadData | null {
  for (const node of graph?.nodes ?? []) {
    const threads = isReviewKind(node.data, "change") || isReviewKind(node.data, "changeHeader") || isReviewKind(node.data, "hunk") ? node.data.phabThreads
      : isReviewKind(node.data, "summary") ? [...node.data.phabGeneralThreads, ...node.data.phabUnanchoredThreads] : [];
    const thread = threads.find((item) => item.anchorId === anchorId);
    if (thread) return thread;
  }
  return null;
}

/** Composer for a reply to the thread: saved as an inline draft on the thread's line, or appended to the general review comment; either is posted on Submit. */
function PhabReply({ data }: { data: PhabThreadData }) {
  const actions = useContext(ChatActionsContext);
  const [text, setText, clearDraft] = useDraftText(`phab-reply:${data.anchorId}`);
  const [open, setOpen] = useState(!!text.trim());
  const { busy, error, run } = useAction();
  const chat = data.thread?.messages.some((message) => message.data.role === "assistant") ? data.thread : null;
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  const save = () => {
    if (!actions || !text.trim() || busy) return;
    void run(async () => {
      if (data.replyLines) await reviewClient.createComment(actions.sessionId, data.diffId, data.replyLines, text.trim(), data.replyTo);
      else await reviewClient.replyInGeneralComment(actions.sessionId, data.replyTo, text.trim());
      clearDraft();
      setOpen(false);
    });
  };
  const draft = () => {
    if (!actions || !chat || busy) return;
    void run(async () => { setText((await reviewClient.draftPhabReply(actions.sessionId, data.anchorId, chat.threadId, actions.models.default)).body); setOpen(true); });
  };
  return <div className="phab-reply nodrag nopan" data-testid="phab-reply" onMouseDown={stop} onClick={stop}>
    {open ? <>
      <Composer label="Reply to Phabricator thread" placeholder={data.replyLines ? "Posted on this line when you submit" : "Added to your review comment when you submit"} value={text} onChange={setText} canSubmit={!!text.trim() && !busy} onSubmit={save} onKeyDown={(event) => { if (event.key === "Escape" && text.trim()) event.preventDefault(); }} />
      <div><button disabled={!text.trim() || busy} onClick={save}>Save reply</button><button disabled={busy} onClick={() => { clearDraft(); setOpen(false); }}>Cancel</button></div>
    </> : <div><button onClick={() => setOpen(true)}>Reply</button></div>}
    {chat && <div><button disabled={busy} onClick={draft}>Draft reply from chat</button></div>}
    <ErrorText error={error} />
  </div>;
}

/** The whole thread (bot comments collapsed) with its saved replies, a reply composer and its chat. */
export function PhabBody({ data, reveal }: { data: PhabThreadData; reveal(nodeId: string, collapseId: string): void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(data.comments.filter((comment) => comment.data.bot).map((comment) => phabCommentCollapseId(data.phabAnchors[comment.data.phid]!))));
  const lead = data.comments.map((comment) => <Fragment key={comment.id}>
    <div className="msg assistant phab-message"><PhabComment comment={comment} anchorId={data.phabAnchors[comment.data.phid]!} hunks={data.hunks} diffId={data.diffId} /></div>
    {data.replies.filter((reply) => reply.artifact!.data.replyTo === data.phabAnchors[comment.data.phid]).map((reply) => <div key={reply.artifact!.id} className="phab-saved-reply"><UserCommentBox item={reply} diffId={data.diffId} /></div>)}
  </Fragment>);
  const thread = data.thread;
  return <CollapseContext.Provider value={{ collapsed, toggle: (id) => setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }), reveal }}>
    <div className="phab-detail-location">{data.path && `${data.path}:${data.line} (${data.side})`}{data.done && <span className="badge phab-done">Done</span>}{data.fromEpoch !== null && <span className="epoch-marker" data-testid="phab-epoch">epoch {data.fromEpoch}</span>}</div>
    {data.summary && <div className="phab-thread-summary"><h4>AI summary</h4><p>{data.summary}</p></div>}
    {lead}
    <PhabReply data={data} />
    <Conversation anchor={data.anchorId} diffId={data.diffId} hunks={data.hunks} threadId={thread?.threadId ?? null} draftId={null} taskId={thread?.taskId ?? null} messages={thread?.messages ?? []} revisions={thread?.revisions ?? {}} mcpRequests={thread?.mcpRequests ?? []} diagramsByMessage={thread?.diagramsByMessage} />
  </CollapseContext.Provider>;
}

/** A Phabricator thread opened from its inline item. */
export function PhabDetails({ data, actions, onClose, onBack, reveal }: { data: PhabThreadData; actions: ChatActions | null; onClose(): void; onBack?: () => void; reveal(nodeId: string, collapseId: string): void }) {
  return <ChatActionsContext.Provider value={actions}>
    <SidePanel className="review-detail-panel" title={`Phabricator · ${data.comments.length}`} closeLabel="Close Phabricator panel" testId="phab-panel" onClose={onClose} onBack={onBack}>
      <PhabBody data={data} reveal={reveal} />
    </SidePanel>
  </ChatActionsContext.Provider>;
}
