import type { Epoch, Id, LlmSelection, Phase, Runtime } from "../../../plugin-api.ts";
import type { RoundDiff } from "../shared/rounds.ts";
import { diffsOf } from "../shared/diffs.ts";
import { narrateRound } from "./narrate-patch.ts";

/** One revision of a round: its diff then, its title and its newest diff overall. */
export interface RoundEntry extends RoundDiff { title: string; latestDiffId: number }
/** A Phabricator stack rebuilt from its root, or local commits with optional revision matches. */
export type RoundSource =
  | { kind: "phabricator"; host: string; stack: RoundEntry[] }
  | { kind: "local"; base: string; head: string; host: string | null; phab: RoundEntry[] | null };
/** `until`: Unix seconds of the next submit of these revisions; Phabricator comments created from then on belong to later rounds. Absent for the latest round. */
export interface RoundPhaseInput { round: RoundSource; narrate: boolean; until?: number; llm?: LlmSelection }

/** Imports one round as a Diff, interdiffs it with the previous Diff, and optionally narrates it. A retry reuses its imported Diff. */
export const roundPhase: Phase<RoundPhaseInput> = {
  id: "round",
  async run(rt: Runtime, sessionId: Id, { round, narrate, llm }, epoch: Epoch) {
    const own = diffsOf(rt.store.listArtifacts(sessionId)).filter((diff) => diff.epoch === epoch.n).at(-1);
    const diffId = own?.id ?? (await rt.run<{ diffId: Id }>(sessionId, "importRound", { round })).diffId;
    const artifacts = rt.store.listArtifacts(sessionId);
    const diffs = diffsOf(artifacts);
    const previous = diffs[diffs.findIndex((diff) => diff.id === diffId) - 1];
    const hasInterdiff = artifacts.some((a) => a.type === "Interdiff" && (a.data as { fromDiff: Id; toDiff: Id }).toDiff === diffId && (a.data as { fromDiff: Id }).fromDiff === previous?.id);
    if (previous && !hasInterdiff) await rt.run(sessionId, "interdiff", { fromDiffId: previous.id, toDiffId: diffId });
    if (narrate) await narrateRound(rt, sessionId, diffId, llm);
  },
};
