import type { Artifact, DecisionData, Epoch, SessionState } from "../shared/types.ts";

/** One chip of the epoch strip: the epoch and what the latest decision after it was. */
export interface EpochChip { n: number; phase: string; status: Epoch["status"]; decision: string | null }

/** `Fix (rule)`, `Accept (you)`, or `?` while the decision is open. */
export function decisionLabel(data: DecisionData): string {
  if (!data.chosen) return "?";
  const chosen = data.chosen;
  return `${data.options.find((option) => option.id === chosen.option)?.label ?? chosen.option} (${chosen.by === "rule" ? "rule" : "you"})`;
}

export function epochChips(state: SessionState): EpochChip[] {
  const decisions = state.artifacts.filter((a) => a.type === "Decision") as Artifact<DecisionData>[];
  return state.epochs.map((epoch) => {
    const after = decisions.filter((d) => d.epoch === epoch.n).at(-1);
    return { n: epoch.n, phase: epoch.phase, status: epoch.status, decision: after ? decisionLabel(after.data) : null };
  });
}

/** The session as it was when epoch `n` was the latest: later epochs and what they created are left out. */
export function stateAtEpoch(state: SessionState, n: number): SessionState {
  const keep = (epoch: number | null) => epoch === null || epoch <= n;
  const artifacts = state.artifacts.filter((a) => keep(a.epoch));
  const ids = new Set(artifacts.map((a) => a.id));
  const known = (ref: string) => ids.has(ref.split("#")[0]!);
  return { ...state, artifacts, tasks: state.tasks.filter((t) => keep(t.epoch)), epochs: state.epochs.filter((e) => e.n <= n), links: state.links.filter((l) => known(l.from) && known(l.to)) };
}

/** Sessions whose workflow asks decisions get the strip; other sessions keep their topbar as it was. */
export const showEpochStrip = (state: SessionState): boolean => state.epochs.length > 0 && state.artifacts.some((a) => a.type === "Decision");
