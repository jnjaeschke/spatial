import { useContext } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { CommitNodeData, ZoomLevel } from "../graph.ts";
import { commitColors } from "../commit-colors.ts";
import { InlineText } from "../InlineText.tsx";
import { AskContext } from "../chat-context.ts";
import { ReopenClosed } from "../ReopenClosed.tsx";

export type CommitFlowNode = Node<CommitNodeData & { level: ZoomLevel } & Record<string, unknown>, "commit">;

export function CommitNode({ id, data }: NodeProps<CommitFlowNode>) {
  const ask = useContext(AskContext);
  const { swatch } = commitColors(data.index);
  return (
    <div className={`node commit-node level-${data.level}`} style={{ borderTopColor: swatch }} data-testid={`commit-${data.index}`} data-level={data.level}>
      <Handle type="target" position={Position.Top} />
      <div className="title"><span className="swatch" style={{ background: swatch }} />C{data.index + 1} <InlineText text={data.commit.subject} />{ask && data.level !== "patch" && <button aria-label={`Ask about commit ${data.index + 1}`} className="ask nodrag" onClick={() => ask.ask(`${data.narrativeId}#commit-${data.index}`)}>Ask</button>}</div>
      <div className="body nodrag nopan">
        {data.intent && <p className="intent"><InlineText text={data.intent} /></p>}
        <p className="counts" data-testid="commit-counts">{data.changeCount} change{data.changeCount === 1 ? "" : "s"} · {data.reviewedCount}/{data.changeCount} reviewed · {data.findingCount} finding{data.findingCount === 1 ? "" : "s"}</p>
        <ReopenClosed hostId={id} />
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
