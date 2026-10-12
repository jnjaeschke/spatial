import type { PhaseViewProps } from "../../../web/plugin-api.ts";
import { implementSummary } from "./command-runs.ts";
import { InvestigationCanvas } from "./InvestigateView.tsx";
import { PhaseShell } from "./api.ts";
import { steerOutcome } from "../runtime/steers.ts";

/** An implement epoch: its shell commands and result above the approved plan. */
export function ImplementView(props: PhaseViewProps) {
  const { state, readOnly = false, epoch } = props;
  const summary = implementSummary(state, epoch?.n ?? null);
  const outcome = steerOutcome(state.artifacts, epoch?.n ?? null);
  return <PhaseShell state={state} epoch={epoch} readOnly={readOnly} running={epoch?.status === "running" ? "Implementing… (progress in the activity strip)" : null} runningTestId="implement-running" head={<>
    {summary && <p className="implement-summary" data-testid="implement-summary">{summary}</p>}
    {outcome && <p className="steer-outcome" data-testid="steer-outcome">{outcome === "resumed" ? "Resumed with your steer." : "Restarted without context."}</p>}
  </>}>
    <InvestigationCanvas {...props} />
  </PhaseShell>;
}
