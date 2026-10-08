import assert from "node:assert/strict";
import test from "node:test";
import type { Artifact, DiffData, NotifyPayload } from "../../../../src/shared/types.ts";
import { isStaleNotice } from "../../../../src/plugins/review/web/notices.ts";

test("revision notices are stale only when their SHA is the latest Diff head", () => {
  const notice = (id: string): NotifyPayload => ({ id, title: "New revision" });
  const latest: Artifact<DiffData> = {
    id: "diff-2", sessionId: "s", type: "Diff", status: "verified",
    data: { baseSha: "B", headSha: "H2", commits: [], files: [] },
    provenance: { taskId: "task" }, createdAt: "now", epoch: null,
  };
  assert.equal(isStaleNotice(notice("revision:H2"), latest), true);
  assert.equal(isStaleNotice(notice("revision:H3"), latest), false);
  assert.equal(isStaleNotice(notice("other"), latest), false);
  assert.equal(isStaleNotice(notice("revision:H2"), null), false);
});
