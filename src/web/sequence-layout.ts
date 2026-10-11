/** Where one step of a sequence diagram sits: lanes are 0-based columns, rows 1-based grid rows (row 1 holds the lane heads). */
export interface SequenceCell { firstLane: number; lastLane: number; direction: "left" | "right" | "self"; loopAt: string | undefined; stepRow: number; phaseRow: number | null }

/** Grid placement of `steps` over `lanes` (lane ids): a phase label row before the first step of each named phase; a self step also spans the neighbouring lane, so its text is not squeezed into one column, and its loop stays on its own lane. */
export function sequenceLayout(lanes: string[], steps: { from: string; to: string; phase?: string | null }[]): { cells: SequenceCell[]; rowCount: number } {
  let row = 2;
  let phase: string | null | undefined;
  const cells = steps.map((step): SequenceCell => {
    const startsPhase = step.phase !== phase;
    phase = step.phase;
    const phaseRow = startsPhase && step.phase ? row++ : null;
    const from = lanes.indexOf(step.from), to = lanes.indexOf(step.to);
    const firstLane = from === to && from === lanes.length - 1 && lanes.length > 1 ? from - 1 : Math.min(from, to);
    const lastLane = from === to && from < lanes.length - 1 ? from + 1 : Math.max(from, to);
    const loopAt = from === to ? `${((from - firstLane) * 2 + 1) * 50 / (lastLane - firstLane + 1)}%` : undefined;
    return { firstLane, lastLane, direction: from === to ? "self" : from < to ? "right" : "left", loopAt, stepRow: row++, phaseRow };
  });
  return { cells, rowCount: row - 1 };
}
