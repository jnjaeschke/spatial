import { createContext } from "react";
import type { ChatThreadData, ModelsResponse, Ref, TaskRecord } from "../shared/types.ts";

/** Opens a draft chat anchored at `anchor`; null when chat is unavailable (fixture mode, models not loaded). */
export type SelectionData = Pick<ChatThreadData, "quote" | "lines">;
/** A chat box the user opened but whose first turn has not produced a thread yet. */
export interface Draft extends SelectionData { id: string; anchor: Ref; aside?: boolean; taskId?: string }
export const AskContext = createContext<{ ask(anchor: Ref, selection?: SelectionData): void } | null>(null);

export interface ChatActions {
  models: ModelsResponse;
  sessionId: string;
  tasks: TaskRecord[];
  onSent(draftId: string, taskId: string): void;
  onDiscard(draftId: string): void;
}
export const ChatActionsContext = createContext<ChatActions | null>(null);
