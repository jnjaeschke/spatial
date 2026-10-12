import { ErrorText, taskState, useAction, type TaskRecord } from "../../../web/plugin-api.ts";
import type { TraceQuestion } from "../shared/types.ts";
import { verdictLine, type TraceStatus } from "../shared/traces.ts";

const ofTrace = (traceId: string) => (input: unknown) => (input as { traceId?: string }).traceId === traceId;

/** A trace not stored yet: "Tracing…" while its tracer runs, else the tracer's error. */
export function PendingTrace({ traceId, tasks }: { traceId: string; tasks: TaskRecord[] }) {
  const { busy, failed } = taskState(tasks, ["traceSpec"], ofTrace(traceId));
  if (failed) return <ErrorText error={failed} testId="trace-failed" />;
  return busy ? <p className="trace-pending" data-testid="trace-pending">Tracing…</p> : null;
}

/** The question, verdict line and check state of a generated trace. */
export function TraceCheckHeader({ question, status, tasks, readOnly, onRecheck }: { question: TraceQuestion; status: TraceStatus; tasks: TaskRecord[]; readOnly: boolean; onRecheck(): Promise<void> }) {
  const action = useAction();
  const check = status.check?.data;
  const run = taskState(tasks, check ? ["checkTrace"] : ["traceSpec", "checkTrace"], ofTrace(status.trace.data.traceId));
  const checking = run.busy;
  return <div className="trace-check" data-testid="trace-check">
    <p className="trace-question"><span className="badge">{question.mode === "claim" ? "Claim" : "Scenario"}</span> {question.text}</p>
    {check && <p className={status.outdated ? "trace-verdict outdated" : "trace-verdict"} data-testid="trace-verdict">{verdictLine(check)}</p>}
    {check?.verdict && <p className="trace-reasoning">{check.verdict.reasoning}</p>}
    {(!check || status.outdated) && <ErrorText error={run.failed} />}
    {checking ? <p className="trace-checking" data-testid="trace-checking">Checking…</p> : (!check || status.outdated) && <div className="trace-recheck">
      {status.outdated && <span className="badge" data-testid="trace-outdated">Outdated</span>}
      {!readOnly && <button type="button" disabled={action.busy} onClick={() => void action.run(onRecheck)}>Re-check</button>}
    </div>}
    <ErrorText error={action.error} />
  </div>;
}
