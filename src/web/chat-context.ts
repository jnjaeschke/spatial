import { createContext } from "react";
import type { ModelsResponse, Ref, TaskRecord } from "../shared/types.ts";

/** Opens a draft chat anchored at `anchor`; null when chat is unavailable (fixture mode, models not loaded). */
export const AskContext = createContext<{ ask(anchor: Ref): void } | null>(null);

export interface ChatActions {
  models: ModelsResponse;
  sessionId: string;
  tasks: TaskRecord[];
  onSent(draftId: string, taskId: string): void;
}
export const ChatActionsContext = createContext<ChatActions | null>(null);
