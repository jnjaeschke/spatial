import assert from "node:assert/strict";
import test from "node:test";
import { shouldDesktopNotify } from "../../src/web/notifications.ts";

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
