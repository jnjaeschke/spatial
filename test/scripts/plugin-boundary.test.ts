import test from "node:test";
import assert from "node:assert/strict";
import { checkPluginBoundary, resolveImport } from "../../scripts/plugin-boundary.ts";

test("resolves relative imports against an in-memory source map", () => {
  assert.equal(resolveImport("src/plugins/review/index.ts", "./tasks/task.ts"), "src/plugins/review/tasks/task.ts");
});

test("allows composition roots to import the plugin registry only", () => {
  const files = new Map([
    ["src/server/main.ts", 'import { plugins } from "../plugins/index.ts";'],
    ["src/server/other.ts", 'import { review } from "../plugins/review/index.ts";'],
  ]);
  assert.deepEqual(checkPluginBoundary(files), ["src/server/other.ts → ../plugins/review/index.ts"]);
});

test("plugin imports stay within their plugin except for public APIs", () => {
  const files = new Map([["src/plugins/review/a.ts", 'import "../../runtime/tasks.ts"; import "../../plugin-api.ts";']]);
  assert.deepEqual(checkPluginBoundary(files), ["src/plugins/review/a.ts → ../../runtime/tasks.ts"]);
});

test("core web files must not import plugin modules", () => {
  const files = new Map([
    ["src/web/Canvas.tsx", 'import { reviewGraph } from "../plugins/review/web/graph.ts";'],
    ["src/web/SessionView.tsx", 'import { webPlugins } from "../plugins/web.ts";'],
    ["src/plugins/review/web/a.ts", 'import "../../../web/plugin-api.ts"; import "../../../web/graph-api.ts"; import "../../../web/Canvas.tsx";'],
  ]);
  assert.deepEqual(checkPluginBoundary(files), ["src/plugins/review/web/a.ts → ../../../web/Canvas.tsx", "src/web/Canvas.tsx → ../plugins/review/web/graph.ts"]);
});
