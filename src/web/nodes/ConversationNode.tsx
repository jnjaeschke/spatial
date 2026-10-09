import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { ConversationNodeData, ZoomLevel } from "../graph.ts";
import { Conversation } from "./ChatNode.tsx";
import { ReopenClosed } from "../ReopenClosed.tsx";
import { Box } from "../Box.tsx";

export type ConversationFlowNode = Node<ConversationNodeData & { level: ZoomLevel } & Record<string, unknown>, "conversation">;

export function ConversationNode({ id, data }: NodeProps<ConversationFlowNode>) {
  return <Box kind="conversation" level={data.level} testId="conversation" title={data.title} handles={{ source: Position.Bottom }}>
    <Conversation {...data} lead={data.threadId === null ? <div className="msg user">{data.prompt}</div> : undefined} />
    <ReopenClosed hostId={id} />
  </Box>;
}
