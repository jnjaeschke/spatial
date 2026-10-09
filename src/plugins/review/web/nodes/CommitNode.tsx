import { useContext, useState } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { CommitNodeData } from "../graph.ts";
import { type ZoomLevel, InlineText, AskContext, ChatActionsContext, api, ReopenClosed } from "../../../../web/plugin-api.ts";
import { commitColors } from "../commit-colors.ts";
import { Box } from "../../../../web/plugin-api.ts";

export type CommitFlowNode = Node<CommitNodeData & { level: ZoomLevel } & Record<string, unknown>, "commit">;

export function CommitNode({ id, data }: NodeProps<CommitFlowNode>) {
  const ask = useContext(AskContext);
  const actions = useContext(ChatActionsContext);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draw = (hint: string) => {
    setDrawing(true);
    setError(null);
    api.turn(actions!.sessionId, { anchor: `${data.narrativeId}#commit-${data.index}`, text: `Draw a sequence diagram of ${hint}.`, llm: actions!.models.default })
      .catch((e: Error) => { setError(e.message); setDrawing(false); });
  };
  const { swatch } = commitColors(data.index);
  return (
    <Box kind="commit" level={data.level} testId={`commit-${data.index}`} data={{ "data-level": data.level }} handles={{ target: Position.Top, source: Position.Bottom }} title={<><span className="swatch" style={{ background: swatch }} />C{data.index + 1} <InlineText text={data.commit.subject} /></>} actions={ask && data.level !== "patch" && <button aria-label={`Ask about commit ${data.index + 1}`} className="ask nodrag" onClick={() => ask.ask(`${data.narrativeId}#commit-${data.index}`)}>Ask</button>}>
      <div className="body nodrag nopan">
        {data.intent && <p className="intent"><InlineText text={data.intent} /></p>}
        <p className="counts" data-testid="commit-counts">{data.changeCount} change{data.changeCount === 1 ? "" : "s"} · {data.reviewedCount}/{data.changeCount} reviewed · {data.findingCount} finding{data.findingCount === 1 ? "" : "s"}</p>
        {data.flowHint && actions && data.level !== "patch" && <p className="flow-hint">Flow: <InlineText text={data.flowHint} /> <button type="button" className="nodrag" disabled={drawing} onClick={() => draw(data.flowHint!)}>{drawing ? "Drawing…" : "Draw diagram"}</button></p>}
        {error && <p className="failed">{error}</p>}
        <ReopenClosed hostId={id} />
      </div>
    </Box>
  );
}
