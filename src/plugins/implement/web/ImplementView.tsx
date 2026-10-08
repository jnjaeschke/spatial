import { Canvas, type PhaseViewProps } from "../../../web/plugin-api.ts";
import { commandChips, implementSummary } from "./command-runs.ts";
import { CommandStrip } from "./CommandStrip.tsx";
import { investigationCanvas } from "./InvestigateView.tsx";
import { RunStatus } from "./RunStatus.tsx";

/** An implement epoch: its shell commands and result above the approved plan. */
export function ImplementView({ state, models, drafts, readOnly = false, epoch, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  const summary = implementSummary(state, epoch?.n ?? null);
  return <div className="session-body">
    <RunStatus sessionId={state.session.id} epoch={epoch} readOnly={readOnly} />
    {epoch?.status === "running" && <p className="running" data-testid="implement-running">Implementing… (progress in the activity strip)</p>}
    <CommandStrip chips={commandChips(state, epoch?.n ?? null)} />
    {summary && <p className="implement-summary" data-testid="implement-summary">{summary}</p>}
    <Canvas model={investigationCanvas} state={state} models={readOnly ? null : models} drafts={drafts} onSent={onSent} onDiscard={onDiscard} onOpenAside={onOpenAside} />
  </div>;
}
