import type { RoundSource } from "../workflow/round.ts";

/** One Phabricator diff of a stack revision: `base` is the commit it applies on, `dateCreated` Unix seconds. */
export interface RoundDiff { revision: number; diffId: number; base: string; dateCreated: number }

/** moz-phab updates a whole stack in one submit; its diffs are created within seconds of each other. */
export const ROUND_WINDOW_SECONDS = 600;

/** Groups a stack's diffs into review rounds, oldest first: a diff joins the current round when it is within the window of the round's first diff and the round has no diff of its revision yet. */
export function groupRounds(diffs: RoundDiff[]): RoundDiff[][] {
  const rounds: RoundDiff[][] = [];
  for (const diff of [...diffs].sort((a, b) => a.dateCreated - b.dateCreated || a.diffId - b.diffId)) {
    const round = rounds.at(-1);
    if (round && diff.dateCreated - round[0]!.dateCreated <= ROUND_WINDOW_SECONDS && !round.some((item) => item.revision === diff.revision)) round.push(diff);
    else rounds.push([diff]);
  }
  return rounds;
}

/** The stack as of round `k`, in `order` (revision ids, root first): each revision's diff in that round, else its newest from an earlier round; revisions without a diff yet are left out. */
export function roundStack(rounds: RoundDiff[][], k: number, order: number[]): RoundDiff[] {
  return order.flatMap((revision) => {
    for (let i = k; i >= 0; i--) {
      const found = rounds[i]!.find((item) => item.revision === revision);
      if (found) return [found];
    }
    return [];
  });
}

/** The epoch chip label of a round: its Phabricator diffs, or the adopted head of a round without any. */
export function roundLabel(round: RoundSource): string {
  const diffs = (entries: RoundDiff[]) => entries.map((entry) => `D${entry.revision} #${entry.diffId}`).join(", ");
  if (round.kind === "phabricator") return `Round · ${diffs(round.stack)}`;
  return round.phab ? `Round · ${diffs(round.phab)} (local)` : `Adopted up to ${round.head.slice(0, 12)}`;
}
