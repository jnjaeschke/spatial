import { Canvas, type CanvasModel, type PhaseViewProps } from "../../../web/plugin-api.ts";
import { investigationGraph } from "./graph.ts";
import { RunStatus } from "./RunStatus.tsx";

export const investigationCanvas: CanvasModel = { graph: investigationGraph };

export function InvestigateView({ state, models, drafts, readOnly = false, epoch, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  return <div className="session-body">
    <RunStatus sessionId={state.session.id} epoch={epoch} readOnly={readOnly} />
    <Canvas model={investigationCanvas} state={state} models={readOnly ? null : models} drafts={drafts} onSent={onSent} onDiscard={onDiscard} onOpenAside={onOpenAside} />
  </div>;
}
