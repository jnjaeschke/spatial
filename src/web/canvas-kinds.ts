import { ChatNode } from "./nodes/ChatNode.tsx";
import { ConversationNode } from "./nodes/ConversationNode.tsx";
import { NoteNode } from "./nodes/NoteNode.tsx";
import { estimateSize, type NodeKind } from "./plugin-api.ts";

export const coreNodeKinds: Record<string, NodeKind> = {
  chat: { component: ChatNode as NodeKind["component"], minimapColor: "var(--kind-chat)", size: estimateSize },
  conversation: { component: ConversationNode as NodeKind["component"], minimapColor: "var(--kind-chat)", size: estimateSize },
  note: { component: NoteNode as NodeKind["component"], minimapColor: "var(--kind-note)", size: estimateSize },
};
