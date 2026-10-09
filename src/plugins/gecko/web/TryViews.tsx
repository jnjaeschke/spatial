import type { Artifact, PhaseViewProps } from "../../../web/plugin-api.ts";
import { PhaseShell } from "../../implement/web/api.ts";
import type { TryProposalData, TryPushData, TryRunData } from "../shared/types.ts";
import { tryHeadline } from "./try-status.ts";

/** A `try` epoch: the proposed command and why; the Push/Skip decision is in the top bar. */
export function TryProposalView({ state, epoch, readOnly = false }: PhaseViewProps) {
  const proposal = state.artifacts.findLast((a) => a.type === "TryProposal" && a.epoch === epoch?.n) as Artifact<TryProposalData> | undefined;
  return <PhaseShell state={state} epoch={epoch} readOnly={readOnly} running={epoch?.status === "running" ? "Choosing try jobs…" : null}>
    {proposal && <div className="try-proposal" data-testid="try-proposal"><code>{proposal.data.command}</code><p>{proposal.data.reason}</p></div>}
  </PhaseShell>;
}

/** A `tryPush` epoch: the mach output and the push as Treeherder reports it, failures expanded. */
export function TryView({ state, epoch, readOnly = false }: PhaseViewProps) {
  const push = state.artifacts.findLast((a) => a.type === "TryPush" && a.epoch === epoch?.n) as Artifact<TryPushData> | undefined;
  const run = push ? (state.artifacts.findLast((a) => a.type === "TryRun" && (a.data as TryRunData).push === push.id) as Artifact<TryRunData> | undefined)?.data ?? null : null;
  return <PhaseShell state={state} epoch={epoch} readOnly={readOnly} running={epoch?.status === "running" ? "Pushing to try… (mach output in the activity strip)" : null}>
    {push && <div className="try-run" data-testid="try-run" data-complete={run?.complete ?? false}>
      <div className="try-headline"><span data-testid="try-headline">{tryHeadline(run)}</span> <a href={push.data.url} target="_blank" rel="noreferrer">Treeherder</a></div>
      {run && run.failures.length > 0 && <ul className="try-failures">{run.failures.map((f) => <li key={f.jobId} data-testid="try-failure">
        <strong>{f.name}</strong> ({f.platform}, {f.result})
        {f.errors.length > 0 && <ul>{f.errors.map((e, i) => <li key={i}>{e.test ? <code>{e.test}</code> : null} {e.message}</li>)}</ul>}
      </li>)}</ul>}
    </div>}
  </PhaseShell>;
}
