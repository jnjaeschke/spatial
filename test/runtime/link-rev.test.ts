import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact } from "../../src/shared/types.ts";
import { selectLinkRev } from "../../src/runtime/link-rev.ts";

const diff = (upstreamRev: string | undefined, n: number): Artifact => ({
  id: `d${n}`, sessionId: "S", type: "Diff", status: "verified", data: { upstreamRev, files: [] },
  provenance: { taskId: "t" }, epoch: null, createdAt: String(n),
});
const view = (...artifacts: Artifact[]) => ({ artifacts, links: [] });

test("selectLinkRev prefers the newest Diff's upstream revision over plugin hooks", () => {
  assert.equal(selectLinkRev(view(diff("old", 1), diff("new", 2), diff(undefined, 3)), [() => "hook"]), "new");
});

test("selectLinkRev falls back to the first plugin hook that knows a revision", () => {
  assert.equal(selectLinkRev(view(diff(undefined, 1)), [() => null, () => "hook", () => "later"]), "hook");
});

test("selectLinkRev is null without a Diff revision or hook answer", () => {
  assert.equal(selectLinkRev(view(), []), null);
  assert.equal(selectLinkRev(view(diff(undefined, 1)), [() => null]), null);
});
