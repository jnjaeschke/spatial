import { createContext } from "react";

/** A task's activity log, scrolled to and expanded at the tool call `callId` when given. */
export interface ActivityLogTarget { taskId: string; callId?: string }
/** Opens the activity log of a task. */
export const OpenActivityLogContext = createContext<((target: ActivityLogTarget) => void) | null>(null);
