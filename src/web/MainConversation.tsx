import { useContext } from "react";
import type { Artifact } from "../shared/types.ts";
import type { ConversationNodeData } from "./graph.ts";
import { ConversationItemsContext } from "./conversation-items.ts";
import { Conversation } from "./nodes/ChatNode.tsx";

/** The session's root conversation: its messages and plugin items, the request until the first turn, and the reply form (with Stop & steer while an epoch runs). */
export function MainConversation({ data }: { data: ConversationNodeData }) {
  const context = useContext(ConversationItemsContext);
  const items = context ? context.artifacts.filter((artifact) => Object.hasOwn(context.components, artifact.type)) : [];
  const renderItem = context ? (artifact: Artifact) => {
    const Item = context.components[artifact.type]!;
    return <Item artifact={artifact} artifacts={context.artifacts} sessionId={context.sessionId} repoDir={context.repoDir} worktree={context.worktree} />;
  } : undefined;
  return <Conversation {...data} canSteer={data.epochRunning === true} items={items} renderItem={renderItem} lead={data.threadId === null ? <div className="msg user">{data.prompt}</div> : undefined} />;
}
