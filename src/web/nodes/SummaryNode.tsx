import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { SummaryNodeData, ZoomLevel } from "../graph.ts";

export type SummaryFlowNode = Node<SummaryNodeData & { level: ZoomLevel } & Record<string, unknown>, "summary">;

export function SummaryNode({ data }: NodeProps<SummaryFlowNode>) {
  return (
    <div className={`node summary-node level-${data.level}`} data-testid="summary">
      <div className="title">{data.changeCount} changes</div>
      <div className="body nodrag nopan">
        <p>{data.summary}</p>
        {data.level !== "patch" && (
          <ul className="files">
            {data.commits.map((c) => <li key={c.sha}>{c.subject}</li>)}
          </ul>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
