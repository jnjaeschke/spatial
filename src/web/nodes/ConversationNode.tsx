import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { ConversationNodeData } from "../graph.ts";
import { Conversation } from "./ChatNode.tsx";
import { ReopenClosed } from "../ReopenClosed.tsx";
import { Box } from "../Box.tsx";

export type ConversationFlowNode = Node<ConversationNodeData & Record<string, unknown>, "conversation">;

export function ConversationNode({ id, data }: NodeProps<ConversationFlowNode>) {
  return <Box kind="conversation" testId="conversation" title={data.title} handles={{ source: Position.Bottom }}>
    <Conversation {...data} canSteer={data.epochRunning === true} lead={data.threadId === null ? <div className="msg user">{data.prompt}</div> : undefined} />
    <ReopenClosed hostId={id} />
  </Box>;
}
