import { Canvas, type CanvasModel, type PhaseViewProps } from "../../../web/plugin-api.ts";
import { investigationCollapsedByDefault, investigationGraph } from "./graph.ts";
import { PhaseShell } from "./api.ts";

export const investigationCanvas: CanvasModel = { graph: investigationGraph, collapsedByDefault: investigationCollapsedByDefault };

export function InvestigateView({ state, models, drafts, readOnly = false, epoch, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  return <PhaseShell state={state} epoch={epoch} readOnly={readOnly}>
    <Canvas model={investigationCanvas} state={state} models={readOnly ? null : models} drafts={drafts} onSent={onSent} onDiscard={onDiscard} onOpenAside={onOpenAside} />
  </PhaseShell>;
}
