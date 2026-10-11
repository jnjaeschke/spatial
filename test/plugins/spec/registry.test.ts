import { test } from "node:test";
import assert from "node:assert/strict";
import { plugins } from "../../../src/plugins/index.ts";

test("the spec plugin is registered", () => {
  assert.ok(plugins.some((plugin) => plugin.id === "spec"));
});
