import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { DecisionNodeData } from "../graph.ts";
import { DecisionControls } from "../DecisionControls.tsx";
import { Box } from "../Box.tsx";

export type DecisionFlowNode = Node<DecisionNodeData & Record<string, unknown>, "decision">;

export function DecisionNode({ data }: NodeProps<DecisionFlowNode>) {
  return <Box kind="decision" testId="decision-node" title="Decision" handles={{ target: Position.Top, source: Position.Bottom }}>
    <DecisionControls sessionId={data.sessionId} repoDir={data.repoDir} decision={data.decision} testId="decision-card" />
  </Box>;
}
