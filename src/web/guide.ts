/** "Start here": the first unreviewed step, or 0 when every step is reviewed. */
export function startStep(reviewed: boolean[]): number {
  const index = reviewed.indexOf(false);
  return index < 0 ? 0 : index;
}

/** The first move lands on start; later moves advance one step, clamped to the path. */
export function moveStep(count: number, current: number | null, delta: 1 | -1, start: number): number {
  return current === null ? start : Math.min(count - 1, Math.max(0, current + delta));
}
