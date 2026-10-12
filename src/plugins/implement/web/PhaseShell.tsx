import { useState, type ReactNode } from "react";
import type { Epoch, SessionState } from "../../../web/plugin-api.ts";
import { CheckResultsList } from "./CheckResultsList.tsx";
import { CommandStrip } from "./CommandStrip.tsx";
import { checkResults } from "./check-results.ts";
import { commandChips } from "./command-runs.ts";
import { RunStatus } from "./RunStatus.tsx";

/** The frame of an implement-style phase view: run status, a running line, the check results, the command strip, then the body. A check result opens its proving command in the strip. */
export function PhaseShell({ state, epoch, readOnly = false, running, runningTestId, children }: { state: SessionState; epoch: Epoch | null; readOnly?: boolean; running?: string | null; runningTestId?: string; children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <div className="session-body">
    <RunStatus sessionId={state.session.id} epoch={epoch} readOnly={readOnly} />
    {running && <p className="running" data-testid={runningTestId}>{running}</p>}
    <CheckResultsList results={checkResults(state, epoch?.n ?? null)} onOpen={setSelected} />
    <CommandStrip chips={commandChips(state, epoch?.n ?? null)} selected={selected} onSelect={setSelected} />
    {children}
  </div>;
}
