import test from "node:test";
import assert from "node:assert/strict";
import { checkPluginBoundary, checkPluginKindReferences, declaredDependencies, resolveImport } from "../../scripts/plugin-boundary.ts";

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

const manifest = (id: string, deps: string) => [`src/plugins/${id}/index.ts`, `export const p = definePlugin({ id: "${id}", ${deps}workflows: [] });`] as const;

test("dependencies are read from the manifest's dependsOn literal", () => {
  const files = new Map([manifest("implement", 'dependsOn: ["review", \'gecko\'], '), manifest("review", "")]);
  assert.deepEqual(declaredDependencies(files, "implement"), ["review", "gecko"]);
  assert.deepEqual(declaredDependencies(files, "review"), []);
  assert.deepEqual(declaredDependencies(files, "missing"), []);
});

test("a plugin may import only the public API modules of a declared dependency", () => {
  const files = new Map([
    manifest("implement", 'dependsOn: ["spec"], '), manifest("spec", ""), manifest("chat", ""),
    ["src/plugins/implement/a.ts", 'import "../spec/api.ts"; import "../spec/runtime/x.ts"; import "../chat/api.ts";'],
    ["src/plugins/implement/web/b.ts", 'import "../../spec/web/api.ts"; import "../../spec/web/graph.ts";'],
  ]);
  assert.deepEqual(checkPluginBoundary(files), [
    "src/plugins/implement/a.ts → ../chat/api.ts",
    "src/plugins/implement/a.ts → ../spec/runtime/x.ts",
    "src/plugins/implement/web/b.ts → ../../spec/web/graph.ts",
  ]);
});

test("a plugin that declares no dependency cannot import another plugin's api", () => {
  const files = new Map([manifest("implement", ""), manifest("review", ""), ["src/plugins/implement/a.ts", 'import "../review/api.ts";']]);
  assert.deepEqual(checkPluginBoundary(files), ["src/plugins/implement/a.ts → ../review/api.ts"]);
});

test("plugin kind literals in core source are reported with their registering plugin", () => {
  const files = new Map([
    ["src/server/http.ts", 'const kind = "Diff"; const task = \'narrate\';'],
    ["src/plugins/review/task.ts", 'const kind = "Diff";'],
  ]);
  assert.deepEqual(checkPluginKindReferences(files, [{ name: "Diff", plugin: "review" }, { name: "narrate", plugin: "review" }], []), [
    'src/server/http.ts:1 → "Diff" (review)',
    'src/server/http.ts:1 → "narrate" (review)',
  ]);
});

test("plugin kind allowlist suppresses only the named file and literal", () => {
  const files = new Map([["src/server/http.ts", 'const kind = "Diff";'], ["src/server/other.ts", 'const kind = "Diff";']]);
  assert.deepEqual(checkPluginKindReferences(files, [{ name: "Diff", plugin: "review" }], [
    { file: "src/server/http.ts", name: "Diff", reason: "A later plan moves this lookup into the review plugin." },
  ]), ['src/server/other.ts:1 → "Diff" (review)']);
});
