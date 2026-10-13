import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact } from "../../../src/shared/types.ts";
import { linkRev } from "../../../src/plugins/gecko/runtime/link-rev.ts";

const artifact = (type: string, data: unknown, id: string): Artifact => ({ id, sessionId: "S", type, status: "verified", data, provenance: { taskId: "t" }, epoch: null, createdAt: id });
const view = (...artifacts: Artifact[]) => ({ artifacts, links: [] });

test("the newest review diff's upstream revision wins over the implement branch base", () => {
  assert.equal(linkRev(view(artifact("ImplementBranch", { baseSha: "branch" }, "b"), artifact("Diff", { upstreamRev: "old" }, "d1"), artifact("Diff", { upstreamRev: "new" }, "d2"))), "new");
});

test("without a diff revision the implement branch base is used", () => {
  assert.equal(linkRev(view(artifact("ImplementBranch", { baseSha: "branch" }, "b"), artifact("Diff", {}, "d"))), "branch");
});

test("no revision is known without a diff or branch", () => {
  assert.equal(linkRev(view()), null);
});
