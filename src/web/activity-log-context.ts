import { createContext } from "react";

/** A task's activity log, scrolled to and expanded at the tool call `callId` when given. */
export interface ActivityLogTarget { taskId: string; callId?: string }
/** The session's main chat popover. */
export interface SessionLogTarget { kind: "session" }
/** The one popover above the footer that is open: a task's log or the session chat. */
export type OpenLog = ActivityLogTarget | SessionLogTarget;
export const isSessionLog = (log: OpenLog | null): log is SessionLogTarget => log !== null && "kind" in log;
/** Opens the activity log of a task. */
export const OpenActivityLogContext = createContext<((target: ActivityLogTarget) => void) | null>(null);
