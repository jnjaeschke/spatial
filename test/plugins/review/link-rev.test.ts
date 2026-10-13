import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact } from "../../../src/shared/types.ts";
import { selectLinkRev } from "../../../src/runtime/link-rev.ts";
import { plugins } from "../../../src/plugins/index.ts";

const diff = (upstreamRev: string, id: string): Artifact => ({
  id, sessionId: "S", type: "Diff", status: "verified", data: { upstreamRev, files: [] },
  provenance: { taskId: "t" }, epoch: null, createdAt: id,
});

test("review supplies Diff revisions through its first-ordered plugin hook", () => {
  assert.equal(plugins[0]!.id, "review");
  const view = { artifacts: [diff("review-rev", "d1")], links: [] };
  const hooks = plugins.flatMap((plugin) => plugin.linkRev ? [plugin.linkRev] : []);
  assert.equal(selectLinkRev(view, hooks), "review-rev");
});
