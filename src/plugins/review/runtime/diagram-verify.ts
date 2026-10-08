import type { DiagramData, DiffData, SequenceLane, SequenceStep } from "../../../shared/types.ts";

export type SequenceStepProposal = Omit<SequenceStep, "verified" | "text">;
export type SequenceProposal = { commit: number; title: string; summary: string; lanes: SequenceLane[]; steps: SequenceStepProposal[]; before: SequenceStepProposal[] | null };

/** Checks sequence citations against the commit tree and its parent flow. */
export async function verifySequence(
  proposal: SequenceProposal,
  diff: Pick<DiffData, "baseSha" | "commits">,
  show: (sha: string, path: string) => Promise<string>,
): Promise<{ ok: true; data: DiagramData } | { ok: false; error: string }> {
  if (!Number.isInteger(proposal.commit) || proposal.commit < 1 || proposal.commit > diff.commits.length) return { ok: false, error: `commit must be between 1 and ${diff.commits.length}` };
  if (proposal.lanes.length < 1 || proposal.lanes.length > 8) return { ok: false, error: "diagram must have between 1 and 8 lanes" };
  const laneIds = new Set<string>();
  for (const lane of proposal.lanes) {
    if (laneIds.has(lane.id)) return { ok: false, error: `duplicate lane id: ${lane.id}` };
    laneIds.add(lane.id);
  }
  if (proposal.steps.length === 0) return { ok: false, error: "diagram must have at least one step" };
  if (proposal.steps.length > 30 || (proposal.before?.length ?? 0) > 30) return { ok: false, error: "diagram exceeds the limit of 30 steps" };
  for (const step of [...proposal.steps, ...(proposal.before ?? [])]) {
    if (!laneIds.has(step.from)) return { ok: false, error: `step references unknown lane: ${step.from}` };
    if (!laneIds.has(step.to)) return { ok: false, error: `step references unknown lane: ${step.to}` };
  }
  if (proposal.steps.some((step) => step.status === "removed")) return { ok: false, error: "removed steps belong in before" };

  const commitIndex = proposal.commit - 1;
  const commit = diff.commits[commitIndex]!;
  const parentSha = commitIndex === 0 ? diff.baseSha : diff.commits[commitIndex - 1]!.sha;
  const cache = new Map<string, Promise<string | null>>();
  const linesAt = (sha: string, path: string): Promise<string[] | null> => {
    const key = `${sha}\0${path}`;
    let contents = cache.get(key);
    if (!contents) {
      contents = Promise.resolve().then(() => show(sha, path)).catch(() => null);
      cache.set(key, contents);
    }
    return contents.then((text) => text?.split(/\r?\n/) ?? null);
  };
  const containsSymbol = (text: string | null, symbol: string): boolean => {
    if (text === null || symbol.length === 0) return false;
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const before = /\w/.test(symbol[0]!) ? "(?<!\\w)" : "";
    const last = symbol[symbol.length - 1]!;
    const after = /\w/.test(last) ? "(?!\\w)" : "";
    return new RegExp(`${before}${escaped}${after}`).test(text);
  };
  const verifySteps = async (steps: SequenceStepProposal[], sha: string): Promise<SequenceStep[]> => Promise.all(steps.map(async (step) => {
    const lines = await linesAt(sha, step.cite.path);
    let match = -1;
    for (let distance = 0; distance <= 2 && match < 0; distance++) {
      for (const index of distance === 0 ? [step.cite.line - 1] : [step.cite.line - 1 - distance, step.cite.line - 1 + distance]) {
        if (index >= 0 && index < (lines?.length ?? 0) && containsSymbol(lines![index]!, step.symbol)) { match = index; break; }
      }
    }
    if (match < 0) return { ...step, verified: false, text: null };
    return { ...step, cite: { ...step.cite, line: match + 1 }, verified: true, text: lines![match]!.trim() };
  }));
  const steps = await verifySteps(proposal.steps, commit.sha);
  const before = proposal.before === null ? null : await verifySteps(proposal.before, parentSha);
  return { ok: true, data: { kind: "sequence", commit: commit.sha, commitIndex, title: proposal.title, summary: proposal.summary, lanes: proposal.lanes, steps, before } };
}
