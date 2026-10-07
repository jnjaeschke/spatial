import { useContext, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ChangeNodeData, ZoomLevel } from "../graph.ts";
import { DiffView } from "../DiffView.tsx";
import { InlineText } from "../InlineText.tsx";
import { AskContext } from "../chat-context.ts";
import { CollapseContext } from "../collapse.ts";
import { ClosedContext } from "../closed.ts";
import { ReopenChats } from "../ReopenChats.tsx";
import { commitColors } from "../commit-colors.ts";
import { api } from "../api.ts";
import { ChatActionsContext } from "../chat-context.ts";
import { Conversation } from "./ChatNode.tsx";
import { numberLines } from "../../shared/diff-lines.ts";

export type ChangeFlowNode = Node<ChangeNodeData & { sessionId: string; level: ZoomLevel } & Record<string, unknown>, "change">;

export function ChangeNode({ id: nodeId, data }: NodeProps<ChangeFlowNode>) {
  const { change, level, files, hunks, sessionId, diffId } = data;
  const ask = useContext(AskContext);
  const actions = useContext(ChatActionsContext);
  const collapse = useContext(CollapseContext);
  const closer = useContext(ClosedContext);
  const [error, setError] = useState<string | null>(null);
  const closed = collapse?.collapsed.has(`${data.narrativeId}#${change.id}`) ?? false;
  const inlineThreads = data.threads.filter((thread) => thread.lines && hunks.some(({ file, hunk }) => {
    const line = thread.lines!;
    return line.path === file.path && thread.anchor.split("#").at(-1) === hunk.id && numberLines(hunk).some((row) => line.end === (line.side === "new" ? row.new : row.old));
  }));
  const renderThread = (thread: ChangeNodeData["threads"][number]) => {
    const id = thread.threadId ?? thread.draftId!;
    const threadClosed = thread.threadId !== null && (collapse?.collapsed.has(thread.threadId) ?? false);
    const lastMessage = thread.messages.at(-1)?.data.text ?? "";
    return <div className="node chat-node hosted-chat" data-testid={`chat-${id}`} data-thread-boundary>
      <div className="title">Chat · {thread.messages.length}{thread.threadId && collapse && <button aria-label={threadClosed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(thread.threadId!)}>{threadClosed ? "▸" : "▾"}</button>}{thread.threadId && closer && <button aria-label="Close" className="close nodrag" onClick={() => closer.close(thread.threadId!)}>✕</button>}</div>
      {threadClosed ? <div className="thread-stub">{lastMessage.slice(0, 100)}</div> : <>{thread.quote && <blockquote className="chat-quote">{thread.quote.length > 300 ? `${thread.quote.slice(0, 300)}…` : thread.quote}</blockquote>}<Conversation {...thread} /></>}
    </div>;
  };
  return (
    <div className={`node change-node level-${level}`} style={data.commit !== null ? { borderLeft: `4px solid ${commitColors(data.commit).swatch}` } : undefined} data-anchor={`${data.narrativeId}#${change.id}`} data-testid={`change-${change.id}`} data-level={level}>
      <Handle type="target" position={Position.Top} />
      <div className="title">{data.commit !== null && <span className="commit-tag">C{data.commit + 1}</span>}<InlineText text={change.title} />{level === "patch" && data.threads.length > 0 && <span className="thread-count">💬 {data.threads.length}</span>}{change.status && <span className={`badge status-${change.status}`} data-testid="change-status">{change.status}</span>}<label className="reviewed nodrag"><input type="checkbox" aria-label={`Reviewed ${change.id}`} checked={data.reviewed} disabled={!actions} onChange={(event) => api.setReviewed(actions!.sessionId, data.narrativeId, change.id, event.currentTarget.checked).catch((e: Error) => setError(e.message))} /> Reviewed</label>{collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(`${data.narrativeId}#${change.id}`)}>{closed ? "▸" : "▾"}</button>}{ask && level !== "patch" && <button aria-label={`Ask about ${change.id}`} className="ask nodrag" onClick={() => ask.ask(`${data.narrativeId}#${change.id}`)}>Ask</button>}</div>
      {error && <div className="failed">{error}</div>}
      {!closed && <div className="body nodrag nopan">
        {level !== "patch" && (
          <>
            <p className="explanation"><InlineText text={change.explanation} hunks={hunks} diffId={diffId} /></p>
            <p className="rationale"><b>Why:</b> <InlineText text={change.rationale} hunks={hunks} diffId={diffId} /></p>
          </>
        )}
        {level === "concept" && (
          <ul className="files">
            {files.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}
        {level === "code" && hunks.map(({ file, hunk }) => <DiffView key={hunk.id} sessionId={sessionId} diffId={diffId} file={file} hunk={hunk} threads={inlineThreads} renderThread={renderThread} />)}
        {level !== "patch" && data.threads.filter((thread) => level === "concept" || !inlineThreads.includes(thread)).map((thread) => <div key={thread.threadId ?? thread.draftId}>{renderThread(thread)}</div>)}
        {level !== "patch" && <ReopenChats hostId={nodeId} />}
      </div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
