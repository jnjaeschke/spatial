import { createContext, type ComponentType } from "react";
import type { Artifact, ChatMessageData } from "../shared/types.ts";
import type { WebPlugin } from "./plugin-api.ts";

/** What a plugin component shown in the root conversation gets: its artifact and the session state shown around it. */
export interface ConversationItemProps { artifact: Artifact; artifacts: Artifact[]; sessionId: string; repoDir: string; worktree: string }

/** The registered conversation item components by artifact type, with the session they render for. */
export const ConversationItemsContext = createContext<{ components: Record<string, ComponentType<ConversationItemProps>>; artifacts: Artifact[]; sessionId: string; repoDir: string; worktree: string; steer?: NonNullable<WebPlugin["steer"]>[string] } | null>(null);

/** Steering is available only when the session workflow has a registered handler. */
export function steerFor(workflow: string | null, plugins: { steer?: WebPlugin["steer"] }[]): ((sessionId: string, text: string, live: boolean) => Promise<unknown>) | undefined {
  return workflow ? Object.assign({}, ...plugins.map((plugin) => plugin.steer ?? {}))[workflow] : undefined;
}

export type ConversationEntry = { message: Artifact<ChatMessageData> } | { item: Artifact };

/** Messages and items in creation order; at the same time a message comes first. */
export function interleave(messages: Artifact<ChatMessageData>[], items: Artifact[]): ConversationEntry[] {
  const entries = [
    ...messages.map((message, index) => ({ at: message.createdAt, order: index, entry: { message } as ConversationEntry })),
    ...items.map((item, index) => ({ at: item.createdAt, order: messages.length + index, entry: { item } as ConversationEntry })),
  ];
  return entries.sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.order - b.order).map(({ entry }) => entry);
}
