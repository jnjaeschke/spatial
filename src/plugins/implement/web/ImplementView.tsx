import { Canvas, type PhaseViewProps } from "../../../web/plugin-api.ts";
import { implementSummary } from "./command-runs.ts";
import { investigationCanvas } from "./InvestigateView.tsx";
import { PhaseShell } from "./api.ts";

/** An implement epoch: its shell commands and result above the approved plan. */
export function ImplementView({ state, models, drafts, readOnly = false, epoch, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  const summary = implementSummary(state, epoch?.n ?? null);
  return <PhaseShell state={state} epoch={epoch} readOnly={readOnly} running={epoch?.status === "running" ? "Implementing… (progress in the activity strip)" : null} runningTestId="implement-running">
    {summary && <p className="implement-summary" data-testid="implement-summary">{summary}</p>}
    <Canvas model={investigationCanvas} state={state} models={readOnly ? null : models} drafts={drafts} onSent={onSent} onDiscard={onDiscard} onOpenAside={onOpenAside} />
  </PhaseShell>;
}
