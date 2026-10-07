import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ConversationNodeData, ZoomLevel } from "../graph.ts";
import { Conversation } from "./ChatNode.tsx";
import { ReopenChats } from "../ReopenChats.tsx";

export type ConversationFlowNode = Node<ConversationNodeData & { level: ZoomLevel } & Record<string, unknown>, "conversation">;

export function ConversationNode({ id, data }: NodeProps<ConversationFlowNode>) {
  return <div className={`node conversation-node level-${data.level}`} data-testid="conversation">
    <div className="title">{data.title}</div>
    <Conversation {...data} lead={data.threadId === null ? <div className="msg user">{data.prompt}</div> : undefined} />
    <ReopenChats hostId={id} />
    <Handle type="source" position={Position.Bottom} />
  </div>;
}
