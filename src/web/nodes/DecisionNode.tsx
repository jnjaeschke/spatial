import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { DecisionNodeData } from "../graph.ts";
import { DecisionControls } from "../DecisionControls.tsx";

export type DecisionFlowNode = Node<DecisionNodeData & Record<string, unknown>, "decision">;

export function DecisionNode({ data }: NodeProps<DecisionFlowNode>) {
  return <div className="node decision-node" data-testid="decision-node">
    <Handle type="target" position={Position.Top} />
    <DecisionControls sessionId={data.sessionId} repoDir={data.repoDir} decision={data.decision} testId="decision-card" />
    <Handle type="source" position={Position.Bottom} />
  </div>;
}
