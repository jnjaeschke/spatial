import type { LaneRow } from "../shared/lanes.ts";

export const ROW_HEIGHT = 26;
const COLUMN = 14;
/** At most this many columns are drawn; wider graphs are clipped at the right. */
const MAX_COLUMNS = 24;
const PALETTE = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#86bcb6"];

const x = (column: number) => column * COLUMN + COLUMN / 2;
const color = (index: number) => PALETTE[index % PALETTE.length]!;
const path = (x1: number, y1: number, x2: number, y2: number) => x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;

/** Pixel width of the lane strip for the loaded rows. */
export function laneWidth(rows: LaneRow[]): number {
  let max = 0;
  for (const row of rows) {
    max = Math.max(max, row.column);
    for (const seg of row.up) max = Math.max(max, seg.from, seg.to);
    for (const seg of row.down) max = Math.max(max, seg.from, seg.to);
  }
  return Math.min(max + 1, MAX_COLUMNS) * COLUMN;
}

export function LaneCell({ row, width }: { row: LaneRow; width: number }) {
  const mid = ROW_HEIGHT / 2;
  return <svg className="lanes" width={width} height={ROW_HEIGHT} aria-hidden="true">
    {row.up.map((seg, index) => <path key={`u${index}`} d={path(x(seg.from), 0, x(seg.to), mid)} stroke={color(seg.color)} />)}
    {row.down.map((seg, index) => <path key={`d${index}`} d={path(x(seg.from), mid, x(seg.to), ROW_HEIGHT)} stroke={color(seg.color)} />)}
    <circle cx={x(row.column)} cy={mid} r={4} fill={color(row.color)} />
  </svg>;
}
