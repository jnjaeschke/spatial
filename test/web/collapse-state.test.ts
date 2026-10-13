import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveCollapsed, expandAllExplicit, toggleExplicit, type CollapseExplicit } from "../../src/web/collapse-state.ts";
import { serializeCollapseState } from "../../src/web/collapse.ts";

test("explicit collapse toggles override defaults across recomputation", () => {
  const defaults = new Set(["default"]);
  let explicit: CollapseExplicit = { collapsed: new Set<string>(), expanded: new Set<string>() };
  assert.deepEqual(effectiveCollapsed(defaults, explicit), new Set(["default"]));
  explicit = toggleExplicit(defaults, explicit, "default");
  assert.deepEqual(effectiveCollapsed(defaults, explicit), new Set());
  assert.deepEqual(effectiveCollapsed(new Set(["default"]), explicit), new Set());
  explicit = toggleExplicit(defaults, explicit, "other");
  assert.deepEqual(effectiveCollapsed(defaults, explicit), new Set(["other"]));
  explicit = toggleExplicit(defaults, explicit, "default");
  assert.deepEqual(effectiveCollapsed(defaults, explicit), new Set(["default", "other"]));
  explicit = toggleExplicit(defaults, explicit, "other");
  assert.deepEqual(effectiveCollapsed(defaults, explicit), new Set(["default"]));
});

test("explicit expansion persists and expand all clears effective collapse", () => {
  const defaults = new Set(["a", "b"]);
  const expanded = toggleExplicit(defaults, { collapsed: new Set(), expanded: new Set() }, "a");
  assert.deepEqual(effectiveCollapsed(defaults, expanded), new Set(["b"]));
  const allExpanded = expandAllExplicit(defaults);
  assert.deepEqual(effectiveCollapsed(defaults, allExpanded), new Set());
});

test("collapse state serialization keeps both explicit sets", () => {
  assert.equal(serializeCollapseState({ collapsed: new Set(["b", "a"]), expanded: new Set(["c"]) }), '{"collapsed":["b","a"],"expanded":["c"]}');
});
