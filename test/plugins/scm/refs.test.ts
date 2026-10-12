import { test } from "node:test";
import assert from "node:assert/strict";
import type { RefRow } from "../../../src/shared/types.ts";
import { groupRefs } from "../../../src/plugins/scm/shared/refs.ts";

const ref = (row: Partial<RefRow> & Pick<RefRow, "name" | "kind">): RefRow => ({ sha: "s", date: "2026-01-01T00:00:00Z", ...row });

test("groupRefs splits local branches, remote-only branches and tags", () => {
  const groups = groupRefs([
    ref({ name: "old", kind: "head", date: "2026-01-01T00:00:00Z" }),
    ref({ name: "new", kind: "head", date: "2026-03-01T00:00:00Z" }),
    ref({ name: "tracked", kind: "head", upstream: "fork/elsewhere", date: "2026-02-01T00:00:00Z" }),
    ref({ name: "here", kind: "head", worktree: "/w", date: "2025-01-01T00:00:00Z" }),
    ref({ name: "origin/new", kind: "remote" }),
    ref({ name: "fork/elsewhere", kind: "remote" }),
    ref({ name: "origin/only-remote", kind: "remote", date: "2026-01-01T00:00:00Z" }),
    ref({ name: "origin/newer-remote", kind: "remote", date: "2026-05-01T00:00:00Z" }),
    ref({ name: "v1", kind: "tag" }),
    ref({ name: "HEAD", kind: "HEAD" }),
  ]);
  assert.deepEqual(groups.local.map((row) => [row.name, row.remotes]), [["here", []], ["new", ["origin/new"]], ["tracked", ["fork/elsewhere"]], ["old", []]]);
  assert.deepEqual(groups.remoteOnly.map((row) => row.name), ["origin/newer-remote", "origin/only-remote"]);
  assert.deepEqual(groups.tags.map((row) => row.name), ["v1"]);
});
