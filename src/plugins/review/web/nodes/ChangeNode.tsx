import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { ChangeNodeData } from "../graph.ts";
import { type ZoomLevel, InlineText, AskContext, ClosedContext, ReopenClosed, api, ChatActionsContext, Conversation, closeChat, Box, ErrorText, useAction } from "../../../../web/plugin-api.ts";
import { DiffView } from "../DiffView.tsx";
import { UserCommentBox } from "../UserCommentBox.tsx";
import { commitColors } from "../commit-colors.ts";
import { numberLines } from "../../shared/diff-lines.ts";

export type ChangeFlowNode = Node<ChangeNodeData & { sessionId: string; level: ZoomLevel } & Record<string, unknown>, "change">;

export function ChangeNode({ id: nodeId, data }: NodeProps<ChangeFlowNode>) {
  const { change, level, files, hunks, sessionId, diffId } = data;
  const ask = useContext(AskContext);
  const actions = useContext(ChatActionsContext);
  const closer = useContext(ClosedContext);
  const { error, run } = useAction();
  const inlineThreads = data.threads.filter((thread) => thread.lines && hunks.some(({ file, hunk }) => {
    const line = thread.lines!;
    return line.path === file.path && thread.anchor.split("#").at(-1) === hunk.id && numberLines(hunk).some((row) => line.end === (line.side === "new" ? row.new : row.old));
  }));
  const renderThread = (thread: ChangeNodeData["threads"][number]) => {
    const id = thread.threadId ?? thread.draftId!;
    const lastMessage = thread.messages.at(-1)?.data.text ?? "";
    return <Box kind="chat" nested className="hosted-chat" data={{ "data-thread-boundary": "" }} testId={`chat-${id}`} title={`Chat · ${thread.messages.length}`} collapse={thread.threadId ? { key: thread.threadId } : undefined} stub={<div className="thread-stub">{lastMessage.slice(0, 100)}</div>} onClose={closer ? () => closeChat(thread.threadId, thread.draftId, actions, closer) : undefined}>
      {thread.quote && <blockquote className="chat-quote">{thread.quote.length > 300 ? `${thread.quote.slice(0, 300)}…` : thread.quote}</blockquote>}<Conversation {...thread} />
    </Box>;
  };
  const errorText = <ErrorText error={error} />;
  return (
    <Box kind="change" level={level} testId={`change-${change.id}`} data={{ "data-anchor": `${data.narrativeId}#${change.id}`, "data-level": level }} style={data.commit !== null ? { borderLeft: `4px solid ${commitColors(data.commit).swatch}` } : undefined} handles={{ target: Position.Top, source: Position.Bottom }} title={<>{data.commit !== null && <span className="commit-tag">C{data.commit + 1}</span>}<InlineText text={change.title} />{level === "patch" && data.threads.length > 0 && <span className="thread-count">💬 {data.threads.length}</span>}{change.status && <span className={`badge status-${change.status}`} data-testid="change-status">{change.status}</span>}</>} actions={<><label className="reviewed nodrag"><input type="checkbox" aria-label={`Reviewed ${change.id}`} checked={data.reviewed} disabled={!actions} onChange={(event) => void run(() => api.setReviewed(actions!.sessionId, data.narrativeId, change.id, event.currentTarget.checked))} /> Reviewed</label>{ask && level !== "patch" && <button aria-label={`Ask about ${change.id}`} className="ask nodrag" onClick={() => ask.ask(`${data.narrativeId}#${change.id}`)}>Ask</button>}</>} collapse={{ key: `${data.narrativeId}#${change.id}` }} stub={errorText}>
      {errorText}
      <div className="body nodrag nopan">
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
        {level === "code" && hunks.map(({ file, hunk }) => <DiffView key={hunk.id} sessionId={sessionId} diffId={diffId} file={file} hunk={hunk} threads={inlineThreads} renderThread={renderThread} comments={data.comments} renderComment={(item) => <UserCommentBox item={item} diffId={diffId} />} />)}
        {level !== "patch" && data.threads.filter((thread) => level === "concept" || !inlineThreads.includes(thread)).map((thread) => <div key={thread.threadId ?? thread.draftId}>{renderThread(thread)}</div>)}
        {level !== "patch" && <ReopenClosed hostId={nodeId} />}
      </div>
    </Box>
  );
}
