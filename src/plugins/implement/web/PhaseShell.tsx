import type { ReactNode } from "react";
import type { Epoch, SessionState } from "../../../web/plugin-api.ts";
import { CommandStrip } from "./CommandStrip.tsx";
import { commandChips } from "./command-runs.ts";
import { RunStatus } from "./RunStatus.tsx";

/** The frame of an implement-style phase view: run status, a running line, the command strip, then the body. */
export function PhaseShell({ state, epoch, readOnly = false, running, runningTestId, children }: { state: SessionState; epoch: Epoch | null; readOnly?: boolean; running?: string | null; runningTestId?: string; children: ReactNode }) {
  return <div className="session-body">
    <RunStatus sessionId={state.session.id} epoch={epoch} readOnly={readOnly} />
    {running && <p className="running" data-testid={runningTestId}>{running}</p>}
    <CommandStrip chips={commandChips(state, epoch?.n ?? null)} />
    {children}
  </div>;
}
