import assert from "node:assert/strict";
import test from "node:test";
import type { Artifact, DiffData, NotifyPayload } from "../../src/shared/types.ts";
import { isStaleNotice, shouldDesktopNotify } from "../../src/web/notifications.ts";

test("desktop notifications require a hidden tab, opt-in, and granted permission", () => {
  assert.equal(shouldDesktopNotify({ hidden: true, enabled: true, permission: "granted" }), true);
  for (const input of [
    { hidden: false, enabled: true, permission: "granted" },
    { hidden: true, enabled: false, permission: "granted" },
    { hidden: true, enabled: true, permission: "denied" },
    { hidden: true, enabled: true, permission: "default" },
    { hidden: true, enabled: true, permission: "unsupported" },
  ] as const) {
    assert.equal(shouldDesktopNotify(input), false);
  }
});

test("revision notices are stale only when their SHA is the latest Diff head", () => {
  const notice = (id: string): NotifyPayload => ({ id, title: "New revision" });
  const latest: Artifact<DiffData> = {
    id: "diff-2", sessionId: "s", type: "Diff", status: "verified",
    data: { baseSha: "B", headSha: "H2", commits: [], files: [] },
    provenance: { taskId: "task" }, createdAt: "now",
  };
  assert.equal(isStaleNotice(notice("revision:H2"), latest), true);
  assert.equal(isStaleNotice(notice("revision:H3"), latest), false);
  assert.equal(isStaleNotice(notice("other"), latest), false);
  assert.equal(isStaleNotice(notice("revision:H2"), null), false);
});
