import { useContext } from "react";
import type { Artifact, DecisionData } from "../shared/types.ts";
import type { ConversationNodeData } from "./graph.ts";
import { ConversationItemsContext } from "./conversation-items.ts";
import { Conversation } from "./nodes/ChatNode.tsx";

/** The session's root conversation: its messages and plugin items, the request until the first turn, the open decision as its newest message, and the reply form (with Steer while an epoch runs). */
export function MainConversation({ data, decision = null }: { data: ConversationNodeData; decision?: Artifact<DecisionData> | null }) {
  const context = useContext(ConversationItemsContext);
  const items = context ? context.artifacts.filter((artifact) => Object.hasOwn(context.components, artifact.type)) : [];
  const renderItem = context ? (artifact: Artifact) => {
    const Item = context.components[artifact.type]!;
    return <Item artifact={artifact} artifacts={context.artifacts} sessionId={context.sessionId} repoDir={context.repoDir} worktree={context.worktree} />;
  } : undefined;
  const steer = data.epochRunning && context?.steer ? (text: string, live: boolean) => context.steer!(context.sessionId, text, live) : undefined;
  return <Conversation {...data} decision={decision} steer={steer} items={items} renderItem={renderItem} lead={data.threadId === null ? <div className="msg user">{data.prompt}</div> : undefined} />;
}
