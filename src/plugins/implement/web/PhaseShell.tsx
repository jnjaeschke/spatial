import { useContext, type ReactNode } from "react";
import { OpenActivityLogContext, type Epoch, type SessionState } from "../../../web/plugin-api.ts";
import { CheckResultsList } from "./CheckResultsList.tsx";
import { checkResults } from "./check-results.ts";
import { commandRunLog, commandSummary, commandSummaryLabel } from "./command-runs.ts";
import { RunStatus } from "./RunStatus.tsx";
import { UsedMemories } from "./UsedMemories.tsx";

/** The frame of an implement-style phase view: run status, a running line, `head` (lines spanning the view's width), the check results, the command summary line, then the body. The summary and a check result's proving command open in the task's activity log. */
export function PhaseShell({ state, epoch, readOnly = false, running, runningTestId, head, children }: { state: SessionState; epoch: Epoch | null; readOnly?: boolean; running?: string | null; runningTestId?: string; head?: ReactNode; children: ReactNode }) {
  const openLog = useContext(OpenActivityLogContext);
  const commands = commandSummary(state, epoch?.n ?? null);
  return <div className="session-body phase-shell">
    <div className="phase-shell-head">
      <RunStatus sessionId={state.session.id} epoch={epoch} readOnly={readOnly} />
      {running && <p className="running" data-testid={runningTestId}>{running}</p>}
      {head}
      <UsedMemories state={state} epoch={epoch} />
      <CheckResultsList results={checkResults(state, epoch?.n ?? null)} onOpen={(runId) => { const target = commandRunLog(state, runId); if (target) openLog?.(target); }} />
      {commands && <p className="command-summary"><button type="button" data-testid="command-summary" onClick={() => openLog?.({ taskId: commands.taskId })}>{commandSummaryLabel(commands)}</button></p>}
    </div>
    {children}
  </div>;
}
