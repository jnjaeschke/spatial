import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { CommitNodeData } from "../graph.ts";
import { IconButton, InlineText, AskContext, ChatActionsContext, api, ErrorText, useAction } from "../../../../web/plugin-api.ts";
import { commitColors } from "../../../../web/plugin-api.ts";
import { Box } from "../../../../web/plugin-api.ts";
import { ChatItem, FindingItem } from "../InlineItem.tsx";

export type CommitFlowNode = Node<CommitNodeData & Record<string, unknown>, "commit">;

export function CommitNode({ id, data }: NodeProps<CommitFlowNode>) {
  const ask = useContext(AskContext);
  const actions = useContext(ChatActionsContext);
  const { busy: drawing, error, run } = useAction();
  const draw = (hint: string) => {
    void run(() => api.turn(actions!.sessionId, { anchor: `${data.narrativeId}#commit-${data.index}`, text: `Draw a sequence diagram of ${hint}.`, llm: actions!.models.default }));
  };
  const { swatch } = commitColors(data.index);
  return (
    <Box kind="commit" testId={`commit-${data.index}`} handles={{ target: Position.Top, source: Position.Bottom }} title={<><span className="swatch" style={{ background: swatch }} />C{data.index + 1} <InlineText text={data.commit.subject} /></>} actions={ask && <IconButton label={`Ask about commit ${data.index + 1}`} className="ask nodrag" onClick={() => ask.ask(`${data.narrativeId}#commit-${data.index}`)}>Ask</IconButton>}>
      <div className="body nodrag nopan">
        {data.intent && <p className="intent"><InlineText text={data.intent} /></p>}
        <p className="counts" data-testid="commit-counts">{data.changeCount} change{data.changeCount === 1 ? "" : "s"} · {data.reviewedCount}/{data.changeCount} reviewed · {data.findingCount} finding{data.findingCount === 1 ? "" : "s"}</p>
        {data.flowHint && actions && <p className="flow-hint">Flow: <InlineText text={data.flowHint} /> <button type="button" className="nodrag" disabled={drawing} onClick={() => draw(data.flowHint!)}>{drawing ? "Drawing…" : "Draw diagram"}</button></p>}
        <ErrorText error={error} />
        <div className="inline-strip">{data.findings.map((finding) => <FindingItem key={finding.findingId} finding={finding} />)}</div>
        <div className="inline-strip">{(data.threads ?? []).map((thread) => <ChatItem key={thread.threadId ?? thread.draftId} thread={thread} />)}</div>
      </div>
    </Box>
  );
}
