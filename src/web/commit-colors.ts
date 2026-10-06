import type { Commit } from "../shared/types.ts";

/** Stable per-commit colors for stack attribution. */
export function commitColors(index: number): { row: string; swatch: string } {
  const hue = (index * 67) % 360;
  return { row: `light-dark(hsl(${hue} 70% 94%), hsl(${hue} 35% 22%))`, swatch: `hsl(${hue} 55% 55%)` };
}

export function commitLabel(index: number, commit: Commit): string {
  return `C${index + 1} ${commit.sha.slice(0, 7)} ${commit.subject}`;
}
