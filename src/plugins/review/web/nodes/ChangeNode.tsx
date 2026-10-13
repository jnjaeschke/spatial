import { reviewClient } from "../client.ts";
import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { ChangeNodeData } from "../graph.ts";
import { ChatItem } from "../InlineItem.tsx";
import { IconButton, InlineText, AskContext, ChatActionsContext, Box, ErrorText, useAction, commitColors } from "../../../../web/plugin-api.ts";

export type ChangeFlowNode = Node<ChangeNodeData & { sessionId: string } & Record<string, unknown>, "change">;

/** The change as a card of its patch: what it does and why, without its diff; the hunks are at its Change place. */
export function ChangeNode({ data }: NodeProps<ChangeFlowNode>) {
  const { change, files, hunks, diffId } = data;
  const ask = useContext(AskContext);
  const actions = useContext(ChatActionsContext);
  const { error, run } = useAction();
  const errorText = <ErrorText error={error} />;
  return (
    <Box kind="change" testId={`change-${change.id}`} data={{ "data-anchor": `${data.narrativeId}#${change.id}` }} style={data.commit !== null ? { borderLeft: `4px solid ${commitColors(data.commit).swatch}` } : undefined} handles={{ target: Position.Top, source: Position.Bottom }} title={<>{data.commit !== null && <span className="commit-tag">C{data.commit + 1}</span>}<InlineText text={change.title} />{data.findings.length > 0 && <span className="thread-count">⚑ {data.findings.length}</span>}{(data.threads.length + data.comments.length) > 0 && <span className="thread-count">💬 {data.threads.length + data.comments.length}</span>}{change.status && <span className={`badge status-${change.status}`} data-testid="change-status">{change.status}</span>}</>} actions={<><label className="reviewed nodrag"><input type="checkbox" aria-label={`Reviewed ${change.id}`} checked={data.reviewed} disabled={!actions} onChange={(event) => void run(() => reviewClient.setReviewed(actions!.sessionId, data.narrativeId, change.id, event.currentTarget.checked))} /> Reviewed</label>{ask && <IconButton label={`Ask about ${change.id}`} className="ask nodrag" onClick={() => ask.ask(`${data.narrativeId}#${change.id}`)}>Ask</IconButton>}</>} collapse={{ key: `${data.narrativeId}#${change.id}` }} stub={errorText}>
      {errorText}
      <div className="body nodrag nopan">
        <p className="explanation"><InlineText text={change.explanation} hunks={hunks} diffId={diffId} /></p>
        <p className="rationale"><b>Why:</b> <InlineText text={change.rationale} hunks={hunks} diffId={diffId} /></p>
        <ul className="files">
          {files.map((f) => <li key={f}>{f}</li>)}
        </ul>
        <div className="inline-strip">{data.threads.map((thread) => <ChatItem key={thread.threadId ?? thread.draftId} thread={thread} />)}</div>
      </div>
    </Box>
  );
}
