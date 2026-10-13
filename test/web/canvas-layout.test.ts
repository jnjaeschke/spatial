import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeWidth } from "../../src/web/canvas-layout.ts";

test("nodeWidth uses fixed kind width, stored width, and satellite width in that order", () => {
  assert.equal(nodeWidth({ resizable: false, defaultWidth: 320, storedWidth: 500, satellite: true, satelliteWidth: 180 }), 320);
  assert.equal(nodeWidth({ resizable: true, defaultWidth: 320, storedWidth: 500, satellite: true, satelliteWidth: 180 }), 500);
  assert.equal(nodeWidth({ resizable: true, defaultWidth: 320, satellite: true, satelliteWidth: 180 }), 180);
  assert.equal(nodeWidth({ resizable: true, defaultWidth: 320, satellite: false, satelliteWidth: 180 }), 320);
});
