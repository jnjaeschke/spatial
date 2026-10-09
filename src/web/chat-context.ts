import { createContext } from "react";
import type { ChatThreadData, ModelsResponse, Ref, TaskRecord } from "../shared/types.ts";

/** Opens a draft chat anchored at `anchor`; null when chat is unavailable (fixture mode, models not loaded). */
export type SelectionData = Pick<ChatThreadData, "quote" | "lines">;
/** A chat box the user opened but whose first turn has not produced a thread yet. */
export interface Draft extends SelectionData { id: string; anchor: Ref; kind?: "chat" | "comment"; aside?: boolean; taskId?: string }
export const AskContext = createContext<{ ask(anchor: Ref, selection?: SelectionData): void; comment?(anchor: Ref, selection: SelectionData): void } | null>(null);

export interface ChatActions {
  models: ModelsResponse;
  sessionId: string;
  tasks: TaskRecord[];
  onSent(draftId: string, taskId: string): void;
  onDiscard(draftId: string): void;
  onNote(draftId: string, noteId: string): void;
}
export const ChatActionsContext = createContext<ChatActions | null>(null);

/** Unsent text per draft id. Drafts live for the page, so a closed draft reopens with its text. */
export const draftTexts = new Map<string, string>();

/** Closing a chat box: an empty draft is discarded, anything else closes and can be reopened from its host. */
export function closeChat(threadId: string | null, draftId: string | null, actions: ChatActions | null, closer: { close(id: string): void } | null): void {
  if (draftId && !threadId && !(draftTexts.get(draftId) ?? "").trim()) { draftTexts.delete(draftId); actions?.onDiscard(draftId); return; }
  const id = threadId ?? draftId;
  if (id) closer?.close(id);
}
