import { createContext } from "react";
import type { useClosed } from "../../../web/plugin-api.ts";
import type { SpecOpenedData } from "../shared/types.ts";
import type { SummaryView } from "../runtime/summaries.ts";

/** What the explorer view shares with its canvas provider. */
export const ExplorerViewContext = createContext<{ sessionId: string; closed: ReturnType<typeof useClosed>; addToTrace(anchor: string, step: string): Promise<void>; focus: { anchor: string; step: string } | null; summaries: Record<string, SummaryView>; flag(ref: string): Promise<void> } | null>(null);
/** What algorithm boxes use: opening a linked algorithm (focusing it when it is already open). `readOnly`: nothing may be requested. */
export const ExplorerContext = createContext<{ readOnly: boolean; open(target: string, from: SpecOpenedData["from"]): Promise<void>; showPath(ref: string, effectId: string): Promise<void>; reveal(nodeId: string): void; addToTrace(anchor: string, step: string): Promise<void>; focus: { anchor: string; step: string } | null; summaries: Record<string, SummaryView>; flag(ref: string): Promise<void> } | null>(null);
