import { ChatNode } from "./nodes/ChatNode.tsx";
import { ConversationNode } from "./nodes/ConversationNode.tsx";
import { NoteNode } from "./nodes/NoteNode.tsx";
import { DecisionNode } from "./nodes/DecisionNode.tsx";
import { estimateSize } from "./graph.ts";
import type { NodeKind } from "./plugin-api.ts";

export const coreNodeKinds: Record<string, NodeKind> = {
  chat: { component: ChatNode as NodeKind["component"], minimapColor: "var(--kind-chat)", size: estimateSize },
  conversation: { component: ConversationNode as NodeKind["component"], minimapColor: "var(--kind-chat)", size: estimateSize },
  note: { component: NoteNode as NodeKind["component"], minimapColor: "var(--kind-note)", size: estimateSize },
  decision: { component: DecisionNode as NodeKind["component"], minimapColor: "var(--kind-note)", size: estimateSize },
};
