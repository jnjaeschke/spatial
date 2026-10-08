import { test } from "node:test";
import assert from "node:assert/strict";
import type { GitCapability } from "../../../../src/plugin-api.ts";
import { nearestFork } from "../../../../src/plugins/review/workflow/review-range.ts";

const git = (refs: string[], bases: Record<string, string | null>, ancestors: [string, string][]) => ({
  mainlineRefs: async () => refs,
  mergeBase: async (_a: string, ref: string) => bases[ref] ?? null,
  isAncestor: async (a: string, b: string) => ancestors.some(([x, y]) => x === a && y === b),
}) as unknown as GitCapability;

test("the nearest fork point is the merge-base that descends from the others", async () => {
  assert.equal(await nearestFork(git(["local", "remote"], { local: "old", remote: "new" }, [["old", "new"]])), "new");
  assert.equal(await nearestFork(git(["local", "remote"], { local: "new", remote: "old" }, [["old", "new"]])), "new");
});

test("without a mainline ref or a merge-base there is no fork point", async () => {
  assert.equal(await nearestFork(git([], {}, [])), null);
  assert.equal(await nearestFork(git(["main"], { main: null }, [])), null);
});
