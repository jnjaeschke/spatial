import { diffsOf, diffNumber, narrativeOf } from "../../shared/diffs.ts";
import { findingStates } from "../../shared/findings.ts";
import { reanchorFinding } from "../../shared/reanchor.ts";
import type { DiffData, FindingCarryData, Hunk, PatchNarrativeData } from "../../../../shared/types.ts";
import { defineTask } from "../../../../runtime/tasks.ts";

export const carryFindings = defineTask<{ narrativeId: string }, { carried: number; outdated: number }>({
  kind: "carryFindings",
  async run(ctx, { narrativeId }) {
    const narrative = ctx.artifacts.get<PatchNarrativeData>(narrativeId);
    if (narrative.type !== "PatchNarrative") throw new Error(`Artifact ${narrativeId} is not a PatchNarrative (got ${narrative.type})`);
    const diffId = narrative.data.diffId;
    const view = ctx.artifacts.view();
    const diffs = diffsOf(view.artifacts);
    const epoch = diffNumber(view.artifacts, diffId);
    if (epoch === 1) return { carried: 0, outdated: 0 };
    const prevDiff = diffs[epoch - 2];
    const prevNarrative = narrativeOf(view.artifacts, prevDiff.id);
    if (!prevNarrative) return { carried: 0, outdated: 0 };
    const prevDiffArtifact = ctx.artifacts.get<DiffData>(prevDiff.id);
    const nextDiff = ctx.artifacts.get<DiffData>(diffId);
    if (prevDiffArtifact.type !== "Diff") throw new Error(`Artifact ${prevDiff.id} is not a Diff (got ${prevDiffArtifact.type})`);
    if (nextDiff.type !== "Diff") throw new Error(`Artifact ${diffId} is not a Diff (got ${nextDiff.type})`);
    const states = findingStates(view, prevNarrative.id);
    let outdated = 0;
    for (const state of states) {
      const oldHunks: { path: string; hunk: Hunk }[] = [];
      if (!state.outdated && state.anchor) {
        const [anchorId, subId] = state.anchor.split("#");
        if (anchorId === prevDiff.id) {
          for (const file of prevDiffArtifact.data.files) {
            const hunk = file.hunks.find((item) => item.id === subId);
            if (hunk) oldHunks.push({ hunk, path: file.path });
          }
        } else if (anchorId === prevNarrative.id) {
          const change = prevNarrative.data.changes.find((item) => item.id === subId);
          if (change) for (const file of prevDiffArtifact.data.files) {
            for (const hunk of file.hunks) if (change.hunkIds.includes(hunk.id)) oldHunks.push({ hunk, path: file.path });
          }
        }
      }
      const result = state.outdated ? null : reanchorFinding({ quote: state.quote, lines: state.lines, oldHunks }, nextDiff.data);
      const carry = ctx.artifacts.put<FindingCarryData>("FindingCarry", "verified", { finding: state.finding.id, toDiff: diffId, hunkId: result?.hunkId ?? null, ...(result?.lines && { lines: result.lines }) });
      ctx.links.put(carry.id, state.finding.id, "about");
      if (!result) outdated++;
    }
    return { carried: states.length, outdated };
  },
});
