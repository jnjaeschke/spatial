import { Canvas, type CanvasModel, type PhaseViewProps } from "../../../web/plugin-api.ts";
import { investigationCollapsedByDefault, investigationGraph, latestInvestigation } from "./graph.ts";
import { PhaseShell } from "./api.ts";

const investigationCanvas: CanvasModel = { graph: investigationGraph, collapsedByDefault: investigationCollapsedByDefault };

/** The investigation canvas; before the Investigation exists there is nothing to draw. */
export function InvestigationCanvas({ state, models, drafts, readOnly = false, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  return latestInvestigation(state)
    ? <Canvas model={investigationCanvas} state={state} models={models} readOnly={readOnly} drafts={drafts} onSent={onSent} onDiscard={onDiscard} onOpenAside={onOpenAside} />
    : <p className="empty" data-testid="investigation-pending">Waiting for the investigation…</p>;
}

export function InvestigateView(props: PhaseViewProps) {
  return <PhaseShell state={props.state} epoch={props.epoch} readOnly={props.readOnly}>
    <InvestigationCanvas {...props} />
  </PhaseShell>;
}
