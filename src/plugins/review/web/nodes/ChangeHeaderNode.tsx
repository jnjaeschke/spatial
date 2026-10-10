import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { ChangeHeaderNodeData } from "../graph.ts";
import { InlineText, AskContext, ChatActionsContext, ReopenClosed, api, Box, ErrorText, useAction, commitColors } from "../../../../web/plugin-api.ts";
import { Chip } from "../Chip.tsx";
import { DetailsContext } from "../details.ts";

export type ChangeHeaderFlowNode = Node<ChangeHeaderNodeData & { sessionId: string } & Record<string, unknown>, "changeHeader">;

/** The change at its Change place: what it does and why, above its hunk cards. */
export function ChangeHeaderNode({ id: nodeId, data }: NodeProps<ChangeHeaderFlowNode>) {
  const { change, hunks, diffId } = data;
  const ask = useContext(AskContext);
  const actions = useContext(ChatActionsContext);
  const details = useContext(DetailsContext);
  const { error, run } = useAction();
  const errorText = <ErrorText error={error} />;
  return (
    <Box kind="change" testId={`change-${change.id}`} data={{ "data-anchor": `${data.narrativeId}#${change.id}` }} style={data.commit !== null ? { borderLeft: `4px solid ${commitColors(data.commit).swatch}` } : undefined} handles={{ target: Position.Top, source: Position.Bottom }} title={<>{data.commit !== null && <span className="commit-tag">C{data.commit + 1}</span>}<InlineText text={change.title} />{change.status && <span className={`badge status-${change.status}`} data-testid="change-status">{change.status}</span>}</>} actions={<><label className="reviewed nodrag"><input type="checkbox" aria-label={`Reviewed ${change.id}`} checked={data.reviewed} disabled={!actions} onChange={(event) => void run(() => api.setReviewed(actions!.sessionId, data.narrativeId, change.id, event.currentTarget.checked))} /> Reviewed</label>{ask && <button aria-label={`Ask about ${change.id}`} className="ask nodrag" onClick={() => ask.ask(`${data.narrativeId}#${change.id}`)}>Ask</button>}</>} collapse={{ key: `${data.narrativeId}#${change.id}` }} stub={errorText}>
      {errorText}
      <div className="body nodrag nopan">
        <p className="explanation"><InlineText text={change.explanation} hunks={hunks} diffId={diffId} /></p>
        <p className="rationale"><b>Why:</b> <InlineText text={change.rationale} hunks={hunks} diffId={diffId} /></p>
        <div className="chip-strip">{data.threads.map((thread) => <Chip key={thread.threadId ?? thread.draftId} kind="chat" label={thread.messages.at(-1)?.data.text ?? "New chat"} count={thread.messages.length} selected={details?.current?.kind === "chat" && details.current.id === (thread.threadId ?? thread.draftId)} testId={`chat-chip-${thread.threadId ?? thread.draftId}`} onOpen={() => details?.open({ kind: "chat", id: thread.threadId ?? thread.draftId! })} />)}</div>
        <ReopenClosed hostId={nodeId} />
      </div>
    </Box>
  );
}
