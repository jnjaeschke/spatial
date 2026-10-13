import { test } from "node:test";
import assert from "node:assert/strict";
import { corePlugin } from "../../../src/runtime/create.ts";
import { pluginRegistry } from "../../../src/runtime/plugins.ts";
import { plugins } from "../../../src/plugins/index.ts";

test("the registry offers the gecko plugin's denied MCP servers and core denies none", () => {
  assert.deepEqual(pluginRegistry([corePlugin]).deniedMcpServers, []);
  assert.deepEqual(pluginRegistry([corePlugin, ...plugins]).deniedMcpServers, ["firefox-devtools"]);
});
