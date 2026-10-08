import type { ChangeStatus, DiffData, Hunk, InterdiffData } from "../../../shared/types.ts";

const overlaps = (aStart: number, aLength: number, bStart: number, bLength: number): boolean =>
  aStart < bStart + Math.max(bLength, 1) && bStart < aStart + Math.max(aLength, 1);

/** Per-hunk status of `next` relative to the previous revision. */
export function hunkStatuses(next: DiffData, prev: DiffData, interdiff: InterdiffData): Map<string, ChangeStatus> {
  const statuses = new Map<string, ChangeStatus>();
  for (const file of next.files) {
    const touched = interdiff.files.filter((item) => item.path === file.path).flatMap((item) => item.hunks);
    const previousFiles = prev.files.filter((item) => item.path === file.path || item.path === file.oldPath);
    for (const hunk of file.hunks) {
      const wasTouched = touched.some((item) => overlaps(item.newStart, item.newLines, hunk.newStart, hunk.newLines));
      if (!wasTouched) statuses.set(hunk.id, "unchanged");
      else {
        const baseOverlap = previousFiles.some((item) => item.hunks.some((old) => overlaps(old.oldStart, old.oldLines, hunk.oldStart, hunk.oldLines)));
        statuses.set(hunk.id, baseOverlap ? "modified" : "new");
      }
    }
  }
  return statuses;
}

/** `unchanged` when every hunk is unchanged, `new` when every hunk is new, else `modified`. */
export function changeStatus(hunkIds: string[], statuses: Map<string, ChangeStatus>): ChangeStatus {
  const values = hunkIds.map((id) => {
    const status = statuses.get(id);
    if (!status) throw new Error(`unknown hunk id ${id}`);
    return status;
  });
  if (values.every((status) => status === "unchanged")) return "unchanged";
  if (values.every((status) => status === "new")) return "new";
  return "modified";
}
