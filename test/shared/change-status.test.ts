import { test } from "node:test";
import assert from "node:assert/strict";
import { changeStatus, hunkStatuses } from "../../src/shared/change-status.ts";
import type { DiffData, Hunk, InterdiffData } from "../../src/shared/types.ts";

const hunk = (id: string, oldStart: number, oldLines: number, newStart: number, newLines: number): Hunk => ({ id, header: "", oldStart, oldLines, newStart, newLines, lines: [] });
const diff = (files: DiffData["files"]): DiffData => ({ baseSha: "b", headSha: "h", commits: [], files });
const file = (path: string, hunks: Hunk[], oldPath?: string) => ({ path, ...(oldPath ? { oldPath } : {}), status: "modified" as const, binary: false, hunks });
const inter = (files: InterdiffData["files"]): InterdiffData => ({ fromDiff: "D1", toDiff: "D2", files, conflicts: [] });

test("classifies unchanged, modified, and new hunks by intersecting ranges", () => {
  const next = diff([file("a", [hunk("unchanged", 1, 2, 1, 2), hunk("modified", 20, 2, 20, 2), hunk("new-gap", 40, 2, 40, 2)]), file("b", [hunk("new-file", 1, 1, 1, 1)]), file("renamed", [hunk("rename", 1, 1, 1, 1)], "old-name")]);
  const prev = diff([file("a", [hunk("old-overlap", 20, 2, 20, 2)]), file("old-name", [hunk("old", 1, 1, 1, 1)])]);
  const touched = inter([file("a", [hunk("i0", 100, 2, 20, 1), hunk("i1", 200, 2, 41, 1)]), file("b", [hunk("i2", 0, 0, 1, 1)]), file("renamed", [hunk("i3", 1, 1, 1, 1)])]);
  const statuses = hunkStatuses(next, prev, touched);
  assert.deepEqual([...statuses], [["unchanged", "unchanged"], ["modified", "modified"], ["new-gap", "new"], ["new-file", "new"], ["rename", "modified"]]);
  assert.equal(changeStatus(["unchanged"], statuses), "unchanged");
  assert.equal(changeStatus(["new-file"], statuses), "new");
  assert.equal(changeStatus(["modified", "new-gap"], statuses), "modified");
  assert.throws(() => changeStatus(["missing"], statuses), /unknown hunk/);
});

test("zero-length hunk ranges have an effective length of one; empty interdiff means unchanged", () => {
  const next = diff([file("a", [hunk("zero", 4, 0, 8, 0)])]);
  const prev = diff([file("a", [hunk("old", 4, 0, 8, 0)])]);
  const statuses = hunkStatuses(next, prev, inter([file("a", [hunk("touch", 10, 0, 8, 0)])]));
  assert.equal(statuses.get("zero"), "modified");
  assert.equal(hunkStatuses(next, prev, inter([])).get("zero"), "unchanged");
});
