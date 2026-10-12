/** A line in one row of the graph: from a column at the row's top (up) or at its node (down) to a column at the node (up) or at the row's bottom (down). */
export interface LaneSeg { from: number; to: number; color: number }
export interface LaneRow { sha: string; column: number; color: number; up: LaneSeg[]; down: LaneSeg[] }
/** Per column the sha its lane waits for (null: free) and the lane's color; `next` is the next unused color. */
export interface LaneState { lanes: (string | null)[]; colors: number[]; next: number }

export const EMPTY_LANES: LaneState = { lanes: [], colors: [], next: 0 };

/** Lays out a topo-ordered page of commits, continuing from `state`; feeding pages one by one gives the same rows as one call over all of them. */
export function layoutLanes(state: LaneState, page: { sha: string; parents: string[] }[]): { rows: LaneRow[]; state: LaneState } {
  const lanes = [...state.lanes];
  const colors = [...state.colors];
  let next = state.next;
  const free = () => { const index = lanes.indexOf(null); return index === -1 ? lanes.length : index; };
  const rows: LaneRow[] = [];
  for (const commit of page) {
    const waiting = lanes.flatMap((sha, index) => sha === commit.sha ? [index] : []);
    const column = waiting[0] ?? free();
    const color = waiting.length ? colors[column]! : next++;
    const up: LaneSeg[] = [];
    lanes.forEach((sha, index) => { if (sha !== null) up.push({ from: index, to: sha === commit.sha ? column : index, color: colors[index]! }); });
    for (const index of waiting) lanes[index] = null;
    const down: LaneSeg[] = [];
    const assigned = new Set<number>();
    commit.parents.forEach((parent, index) => {
      const existing = lanes.indexOf(parent);
      if (existing !== -1) { down.push({ from: column, to: existing, color: colors[existing]! }); return; }
      const target = index === 0 ? column : free();
      lanes[target] = parent;
      colors[target] = index === 0 ? color : next++;
      assigned.add(target);
      down.push({ from: column, to: target, color: colors[target]! });
    });
    lanes.forEach((sha, index) => { if (sha !== null && !assigned.has(index)) down.push({ from: index, to: index, color: colors[index]! }); });
    while (lanes.length && lanes.at(-1) === null) { lanes.pop(); colors.pop(); }
    rows.push({ sha: commit.sha, column, color, up, down });
  }
  return { rows, state: { lanes, colors, next } };
}
