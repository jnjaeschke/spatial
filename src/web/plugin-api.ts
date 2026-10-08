/**
 * Web plugins provide phase views selected by the session shell. A phase view
 * owns its body and may portal phase-specific controls into the shell's topbar.
 * Node kinds are registered here so the canvas can render plugin artifacts.
 */
import { createContext, useContext, type ComponentType, type ReactNode, type ReactPortal } from "react";
import { createPortal } from "react-dom";
import type { SessionState, ModelsResponse, NotifyPayload } from "../shared/types.ts";
import type { Draft } from "./chat-context.ts";

export interface PhaseViewProps { state: SessionState; models: ModelsResponse; drafts: Draft[]; readOnly?: boolean; onSent(draftId: string, taskId: string): void; onDiscard(draftId: string): void; onOpenAside(draft: Draft): void }
export interface PhaseView { Body: ComponentType<PhaseViewProps>; exportable?(state: SessionState): boolean; isStaleNotice?(state: SessionState, notice: NotifyPayload): boolean }
export interface WebPlugin { id: string; phaseViews: Record<string, PhaseView>; workflowPhase?: Record<string, string>; nodeKinds?: Record<string, unknown> }

export const TopbarSlot = createContext<HTMLElement | null>(null);
export interface FileViewRequest { diffId: string; path: string; hunkId: string; text?: string }
export const FileViewContext = createContext<((file: FileViewRequest) => void) | null>(null);
export function TopbarExtras({ children }: { children: ReactNode }): ReactPortal | null {
  const slot = useContext(TopbarSlot);
  return slot ? createPortal(children, slot) : null;
}

export { Canvas } from "./Canvas.tsx";
export type { HunkRow } from "./Canvas.tsx";
export { AskContext, ChatActionsContext } from "./chat-context.ts";
export type { Draft, SelectionData } from "./chat-context.ts";
export { api } from "./api.ts";
export { RowPainter, rowSegments } from "./syntax.ts";
export { SearchfoxContext, searchUrl, searchfoxLinks, fileUrl, linkTitle } from "./searchfox-url.ts";
export { AnswerMarkdown } from "./AnswerMarkdown.tsx";
export { CollapseContext } from "./collapse.ts";
export { loadFileLines } from "./file-lines.ts";
export { latestNarrative, phabCommentCollapseId } from "./graph.ts";
export type { HostedThread } from "./graph.ts";
export * from "../shared/types.ts";
