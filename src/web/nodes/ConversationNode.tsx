import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { Artifact } from "../../shared/types.ts";
import type { ConversationNodeData } from "../graph.ts";
import { ConversationItemsContext } from "../conversation-items.ts";
import { Conversation } from "./ChatNode.tsx";
import { ReopenClosed } from "../ReopenClosed.tsx";
import { Box } from "../Box.tsx";

export type ConversationFlowNode = Node<ConversationNodeData & Record<string, unknown>, "conversation">;

export function ConversationNode({ id, data }: NodeProps<ConversationFlowNode>) {
  const context = useContext(ConversationItemsContext);
  const items = context ? context.artifacts.filter((artifact) => Object.hasOwn(context.components, artifact.type)) : [];
  const renderItem = context ? (artifact: Artifact) => {
    const Item = context.components[artifact.type]!;
    return <Item artifact={artifact} artifacts={context.artifacts} sessionId={context.sessionId} repoDir={context.repoDir} worktree={context.worktree} />;
  } : undefined;
  return <Box kind="conversation" testId="conversation" title={data.title} handles={{ source: Position.Bottom }}>
    <Conversation {...data} canSteer={data.epochRunning === true} items={items} renderItem={renderItem} lead={data.threadId === null ? <div className="msg user">{data.prompt}</div> : undefined} />
    <ReopenClosed hostId={id} />
  </Box>;
}
