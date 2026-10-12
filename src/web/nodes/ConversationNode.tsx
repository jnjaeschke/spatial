import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { ConversationNodeData } from "../graph.ts";
import { MainConversation } from "../MainConversation.tsx";
import { Box } from "../Box.tsx";

export type ConversationFlowNode = Node<ConversationNodeData & Record<string, unknown>, "conversation">;

export function ConversationNode({ data }: NodeProps<ConversationFlowNode>) {
  return <Box kind="conversation" testId="conversation" title={data.title} handles={{ source: Position.Bottom }}>
    <MainConversation data={data} />
  </Box>;
}
