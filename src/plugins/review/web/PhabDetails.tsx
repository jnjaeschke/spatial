import { useState } from "react";
import { ChatActionsContext, CollapseContext, Conversation, SidePanel, type ChatActions, type Graph } from "../../../web/plugin-api.ts";
import { isReviewKind, phabCommentCollapseId, type PhabThreadData } from "./graph.ts";
import { PhabComment } from "./PhabComment.tsx";

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

/** The whole thread (bot comments collapsed) with its chat. */
export function PhabBody({ data, reveal }: { data: PhabThreadData; reveal(nodeId: string, collapseId: string): void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(data.comments.filter((comment) => comment.data.bot).map((comment) => phabCommentCollapseId(data.phabAnchors[comment.data.phid]!))));
  const lead = data.comments.map((comment) => <div key={comment.id} className="msg assistant phab-message"><PhabComment comment={comment} anchorId={data.phabAnchors[comment.data.phid]!} hunks={data.hunks} diffId={data.diffId} /></div>);
  const thread = data.thread;
  return <CollapseContext.Provider value={{ collapsed, toggle: (id) => setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }), reveal }}>
    <div className="phab-detail-location">{data.path && `${data.path}:${data.line} (${data.side})`}{data.done && <span className="badge phab-done">Done</span>}{data.fromEpoch !== null && <span className="epoch-marker" data-testid="phab-epoch">epoch {data.fromEpoch}</span>}</div>
    {data.summary && <div className="phab-thread-summary"><h4>AI summary</h4><p>{data.summary}</p></div>}
    {lead}
    <Conversation anchor={data.anchorId} diffId={data.diffId} hunks={data.hunks} threadId={thread?.threadId ?? null} draftId={null} taskId={thread?.taskId ?? null} messages={thread?.messages ?? []} revisions={thread?.revisions ?? {}} mcpRequests={thread?.mcpRequests ?? []} diagramsByMessage={thread?.diagramsByMessage} />
  </CollapseContext.Provider>;
}

/** A Phabricator thread opened from its inline item. */
export function PhabDetails({ data, actions, onClose, onBack, reveal }: { data: PhabThreadData; actions: ChatActions | null; onClose(): void; onBack?: () => void; reveal(nodeId: string, collapseId: string): void }) {
  return <ChatActionsContext.Provider value={actions}>
    <SidePanel className="review-detail-panel" title={`Phabricator · ${data.comments.length}`} closeLabel="Close Phabricator panel" testId="phab-panel" onClose={onClose}
      onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); onClose(); } }}
      headerExtra={onBack && <button aria-label="Back" onClick={onBack}>←</button>}>
      <PhabBody data={data} reveal={reveal} />
    </SidePanel>
  </ChatActionsContext.Provider>;
}
