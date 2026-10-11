import { createContext } from "react";
import type { useClosed } from "../../../web/plugin-api.ts";
import type { SpecOpenedData } from "../shared/types.ts";
import type { SummaryView } from "../runtime/summaries.ts";
import type { EngineMapping } from "../shared/types.ts";
import type { Engine, TaskRecord } from "../../../plugin-api.ts";

/** A step to highlight; the box is revealed once per `nonce`. */
export interface SpecFocus { anchor: string; step: string; nonce: number }

/** What the explorer view shares with its canvas provider. */
export const ExplorerViewContext = createContext<{ sessionId: string; closed: ReturnType<typeof useClosed>; addToTrace(anchor: string, step: string): Promise<void>; focus: SpecFocus | null; takeFocus(focus: SpecFocus): boolean; summaries: Record<string, SummaryView>; mappings: Partial<Record<Engine, Record<string, EngineMapping | null>>>; tasks: TaskRecord[]; flag(ref: string): Promise<void> } | null>(null);
/** What algorithm boxes use: opening a linked algorithm (focusing it when it is already open). `readOnly`: nothing may be requested. */
export const ExplorerContext = createContext<{ readOnly: boolean; open(target: string, from: SpecOpenedData["from"]): Promise<void>; showPath(ref: string, effectId: string): Promise<void>; reveal(nodeId: string): void; addToTrace(anchor: string, step: string): Promise<void>; focus: SpecFocus | null; summaries: Record<string, SummaryView>; mappings: Partial<Record<Engine, Record<string, EngineMapping | null>>>; tasks: TaskRecord[]; flag(ref: string): Promise<void> } | null>(null);
