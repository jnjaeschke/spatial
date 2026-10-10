/**
 * Web plugins provide phase views selected by the session shell. A phase view
 * owns its body and may portal phase-specific controls into the shell's topbar.
 * Node kinds are registered here so the canvas can render plugin artifacts.
 */
import { createContext, useContext, type ComponentType, type ReactNode, type ReactPortal } from "react";
import { createPortal } from "react-dom";
import type { SessionState, ModelsResponse, NotifyPayload, Epoch } from "../shared/types.ts";
import type { Draft } from "./chat-context.ts";
import type { GraphNodeData } from "./graph-api.ts";
import type { NodeProps } from "@xyflow/react";

export interface PhaseViewProps { state: SessionState; models: ModelsResponse; drafts: Draft[]; /** The epoch being shown; null before the first epoch. A past epoch comes with the session state as it was then and `readOnly`. */ epoch: Epoch | null; readOnly?: boolean; onSent(draftId: string, taskId: string): void; onDiscard(draftId: string): void; onOpenAside(draft: Draft): void }
/** What a static export embeds of the latest diff: its id, its commit shas, and the paths of files whose full text is included. */
export interface ExportDiff { id: string; commits: string[]; files: string[] }
export interface PhaseView {
  Body: ComponentType<PhaseViewProps>;
  /** Whether selected diff lines can start a local inline comment. */
  commentsOnSelection?: boolean;
  /** Whether the Export button shows; default false. */
  exportable?(state: SessionState): boolean;
  /** The diff an export carries file texts of; none for views without diffs. */
  exportDiff?(state: SessionState): ExportDiff | null;
  /** Whether a notification is stale for this view and is not shown. */
  isStaleNotice?(state: SessionState, notice: NotifyPayload): boolean;
}
export interface NodeKind {
  component: ComponentType<NodeProps>;
  minimapColor: string;
  /** First-paint size estimate before measurement, unscaled. */
  size(data: GraphNodeData): { width: number; height: number };
  /** False: no width handle and the width always comes from `size` (diagram). Default true. */
  resizable?: boolean;
}
export interface WebPlugin { id: string; phaseViews: Record<string, PhaseView>; workflowPhase?: Record<string, string>; nodeKinds?: Record<string, NodeKind> }
export const NodeKindsContext = createContext<Record<string, NodeKind>>({});

export const TopbarSlot = createContext<HTMLElement | null>(null);
/** A location in a diff to show; with `row` the view jumps to that row where the diff is shown, without it the view opens the file. */
export { FileViewContext } from "./file-view-context.ts";
export type { FileViewRequest } from "./file-view-context.ts";
export function TopbarExtras({ children }: { children: ReactNode }): ReactPortal | null {
  const slot = useContext(TopbarSlot);
  return slot ? createPortal(children, slot) : null;
}

export { Canvas } from "./Canvas.tsx";
export { Box } from "./Box.tsx";
export type { BoxProps } from "./Box.tsx";
export { Dialog } from "./Dialog.tsx";
export { Composer, useDraftText } from "./Composer.tsx";
export type { ComposerProps } from "./Composer.tsx";
export { composerKey, COMPOSER_HINT } from "./composer-key.ts";
export { useAction, ErrorText } from "./action.tsx";
export type { NodeProps } from "@xyflow/react";
export * from "./graph-api.ts";
export { InlineText } from "./InlineText.tsx";
export { AskContext, ChatActionsContext, closeChat, draftTexts } from "./chat-context.ts";
export { CollapseContext } from "./collapse.ts";
export { ClosedContext } from "./closed.ts";
export { ReopenClosed } from "./ReopenClosed.tsx";
export { api } from "./api.ts";
export { Conversation } from "./nodes/ChatNode.tsx";
export type { CanvasModel, GuideStep, FocusedRow, CanvasProviderProps } from "./Canvas.tsx";
export type { SelectionData } from "./chat-context.ts";
export { RowPainter, rowSegments } from "./syntax.ts";
export { SearchfoxContext, searchfoxLinks, mergedCodeLinks, fileUrl, linkTitle } from "./searchfox-url.ts";
export { AnswerMarkdown } from "./AnswerMarkdown.tsx";
export { loadFileLines } from "./file-lines.ts";
export { DiffRows, changeStarts, type RowMark } from "./diff/DiffRows.tsx";
export { DiffView } from "./diff/DiffView.tsx";
export { FilePanel } from "./diff/FilePanel.tsx";
export type { HunkRow } from "./diff/FilePanel.tsx";
export { SidePanel } from "./SidePanel.tsx";
export { Segmented } from "./Segmented.tsx";
export { StackContext } from "./diff/stack-context.ts";
export { commitColors, commitLabel } from "./diff/commit-colors.ts";
export { numberLines, fileRows } from "../shared/diff-lines.ts";
export type { Row } from "../shared/diff-lines.ts";
export * from "../shared/types.ts";
export type { CanvasProps } from "./Canvas.tsx";
export type { ConversationProps } from "./nodes/ChatNode.tsx";
export type { ChatActions } from "./chat-context.ts";
export type { SearchfoxLinks } from "./searchfox-url.ts";
export type { Segment, CodeRow } from "./syntax.ts";
export type { ClosedItem } from "./graph.ts";
