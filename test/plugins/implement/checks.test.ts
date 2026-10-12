import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWptMeta, verifyChecks, wptBaseEvidence } from "../../../src/plugins/implement/runtime/checks.ts";
import { describeCheck, isWptTest, testPaths } from "../../../src/plugins/implement/shared/acceptance.ts";
import type { AcceptanceCheck } from "../../../src/plugins/implement/shared/types.ts";

const LOOKUP = `[Node-lookupNamespaceURI.html]
  [Element has namespace URI matching prefix]
    expected: FAIL

  [Comment should inherit namespace URI matching prefix]
    expected: FAIL

  [Child element should inherit baz namespace]
    expected: FAIL
`;
const SCROLLEND = `[scrollend-event-for-user-scroll.html]
  expected:
    if os == "mac": OK
    TIMEOUT
  [Tests that the target_div gets scrollend event when touch dragging.]
    expected:
      if os == "mac": PASS
      TIMEOUT
`;
const ABORT = `[AbortSignal.any.worker.html]
  max-asserts: 2

[AbortSignal.any.html]
  expected:
    if (os == "android") and not debug: [OK, TIMEOUT]
  max-asserts: 2

[AbortSignal.any.shadowrealm.html]
  expected: ERROR
`;
const DISABLED = `[Event-timestamp-high-resolution.https.html]
  disabled:
    if not debug: https://bugzilla.mozilla.org/show_bug.cgi?id=1427918
  [Constructed GamepadEvent timestamp should be high resolution and have the same time origin as performance.now()]
    expected:
      if os == "android": [PASS, FAIL]
`;
const ESCAPED = `[OpaqueRange-supported-elements.html]
  [createValueRange should work on textarea.]
    expected: FAIL

  [createValueRange should work on input[type=text\\].]
    expected: FAIL
`;

test("parseWptMeta reads sections, subtests and plain expected values", () => {
  const meta = parseWptMeta(LOOKUP);
  assert.deepEqual([...meta.keys()], ["Node-lookupNamespaceURI.html"]);
  const section = meta.get("Node-lookupNamespaceURI.html")!;
  assert.deepEqual(section.expected, []);
  assert.deepEqual([...section.subtests.keys()], ["Element has namespace URI matching prefix", "Comment should inherit namespace URI matching prefix", "Child element should inherit baz namespace"]);
  assert.deepEqual(section.subtests.get("Child element should inherit baz namespace"), [{ status: "FAIL", condition: null }]);
});

test("parseWptMeta reads conditional lists with and without a default and ignores other keys", () => {
  const scroll = parseWptMeta(SCROLLEND).get("scrollend-event-for-user-scroll.html")!;
  const mac = 'if os == "mac"';
  assert.deepEqual(scroll.expected, [{ status: "OK", condition: mac }, { status: "TIMEOUT", condition: null }]);
  assert.deepEqual(scroll.subtests.get("Tests that the target_div gets scrollend event when touch dragging."), [{ status: "PASS", condition: mac }, { status: "TIMEOUT", condition: null }]);
  const abort = parseWptMeta(ABORT);
  const android = 'if (os == "android") and not debug';
  assert.deepEqual(abort.get("AbortSignal.any.worker.html")!.expected, []);
  assert.deepEqual(abort.get("AbortSignal.any.html")!.expected, [{ status: "OK", condition: android }, { status: "TIMEOUT", condition: android }]);
  assert.deepEqual(abort.get("AbortSignal.any.shadowrealm.html")!.expected, [{ status: "ERROR", condition: null }]);
  const disabled = parseWptMeta(DISABLED).get("Event-timestamp-high-resolution.https.html")!;
  assert.deepEqual(disabled.expected, []);
  assert.deepEqual([...disabled.subtests.values()], [[{ status: "PASS", condition: 'if os == "android"' }, { status: "FAIL", condition: 'if os == "android"' }]]);
});

test("parseWptMeta unescapes brackets in subtest names", () => {
  const section = parseWptMeta(ESCAPED).get("OpaqueRange-supported-elements.html")!;
  assert.deepEqual([...section.subtests.keys()], ["createValueRange should work on textarea.", "createValueRange should work on input[type=text]."]);
});

test("wptBaseEvidence counts the named subtests that expect a failure", () => {
  const meta = parseWptMeta(LOOKUP);
  assert.deepEqual(wptBaseEvidence(meta, ["Element has namespace URI matching prefix", "Child element should inherit baz namespace"]), { evidence: "FAIL at base: 2 of 2 named subtests" });
  assert.deepEqual(wptBaseEvidence(meta, ["Element has namespace URI matching prefix", "Nope"]), { problem: `the metadata expects no failure for "Nope"` });
});

test("wptBaseEvidence puts the condition into the evidence when every failing expectation is conditional", () => {
  const name = "Constructed GamepadEvent timestamp should be high resolution and have the same time origin as performance.now()";
  assert.deepEqual(wptBaseEvidence(parseWptMeta(DISABLED), [name]), { evidence: 'FAIL at base (if os == "android"): 1 of 1 named subtests' });
  const scroll = "Tests that the target_div gets scrollend event when touch dragging.";
  assert.deepEqual(wptBaseEvidence(parseWptMeta(SCROLLEND), [scroll]), { evidence: "TIMEOUT at base: 1 of 1 named subtests" });
});

test("wptBaseEvidence without named subtests accepts a failing test or any failing subtest", () => {
  assert.deepEqual(wptBaseEvidence(parseWptMeta(LOOKUP), []), { evidence: "FAIL at base: 3 subtests" });
  assert.deepEqual(wptBaseEvidence(parseWptMeta(ABORT), []), { evidence: 'TIMEOUT at base (if (os == "android") and not debug): the test as a whole' });
  assert.deepEqual(wptBaseEvidence(parseWptMeta("[a.html]\n  max-asserts: 2\n"), []), { problem: "the metadata expects no failure" });
});

const TESTS = "testing/web-platform/tests/dom/nodes/Node-lookupNamespaceURI.html";
const files: Record<string, string> = {
  "test/t_old.js": "x",
  [TESTS]: "<!doctype html>",
  "testing/web-platform/meta/dom/nodes/Node-lookupNamespaceURI.html.ini": LOOKUP,
  "testing/web-platform/tests/dom/pass.html": "x",
  "testing/web-platform/meta/dom/pass.html.ini": "[pass.html]\n  max-asserts: 2\n",
  "testing/web-platform/tests/dom/nometa.html": "x",
};
const show = async (path: string) => {
  const text = files[path];
  if (text === undefined) throw new Error(`no ${path}`);
  return text;
};

test("verifyChecks drops checks the base contradicts and records WPT evidence", async () => {
  const { verified, dropped } = await verifyChecks([
    { kind: "new-test", path: "test/t_new.js" },
    { kind: "new-test", path: "test/t_old.js" },
    { kind: "covering-test", path: "test/t_old.js" },
    { kind: "covering-test", path: "test/gone.js" },
    { kind: "failing-test", path: "test/t_old.js", subtests: [] },
    { kind: "failing-test", path: TESTS, subtests: ["Element has namespace URI matching prefix", "Child element should inherit baz namespace"] },
    { kind: "failing-test", path: "testing/web-platform/tests/dom/pass.html", subtests: [] },
    { kind: "failing-test", path: "testing/web-platform/tests/dom/nometa.html", subtests: [] },
    { kind: "measure", command: "./mach perftest x", goal: "lower" },
    { kind: "measure", command: " ", goal: "lower" },
    { kind: "new-test", path: " " },
  ], show);
  assert.deepEqual(verified, [
    { kind: "new-test", path: "test/t_new.js" },
    { kind: "covering-test", path: "test/t_old.js" },
    { kind: "failing-test", path: "test/t_old.js", subtests: [] },
    { kind: "failing-test", path: TESTS, subtests: ["Element has namespace URI matching prefix", "Child element should inherit baz namespace"], baseEvidence: "FAIL at base: 2 of 2 named subtests" },
    { kind: "measure", command: "./mach perftest x", goal: "lower" },
  ]);
  assert.deepEqual(dropped, [
    "new-test test/t_old.js: the file already exists at the base",
    "covering-test test/gone.js: file not found at the base",
    "failing-test testing/web-platform/tests/dom/pass.html: the metadata expects no failure",
    "failing-test testing/web-platform/tests/dom/nometa.html: no WPT metadata at the base",
    "measure: needs a command and a goal",
    "new-test: needs a path",
  ]);
});

test("a covering-test may name a file an earlier step adds, a failing-test may not", async () => {
  const { verified, dropped } = await verifyChecks([{ kind: "covering-test", path: "t/new.js" }, { kind: "failing-test", path: "t/new.js", subtests: [] }], show, new Set(["t/new.js"]));
  assert.deepEqual(verified, [{ kind: "covering-test", path: "t/new.js" }]);
  assert.deepEqual(dropped, ["failing-test t/new.js: file not found at the base"]);
});

test("checks are described for prompts and the UI, and test paths exclude measures", () => {
  const checks: AcceptanceCheck[] = [
    { kind: "new-test", path: "a.js" },
    { kind: "failing-test", path: "b.html", subtests: ["x", "y"], baseEvidence: "FAIL at base: 2 of 2 named subtests" },
    { kind: "covering-test", path: "c.js" },
    { kind: "measure", command: "bench", goal: "faster" },
  ];
  assert.deepEqual(checks.map(describeCheck), ["new-test a.js", "failing-test b.html (x; y) [FAIL at base: 2 of 2 named subtests]", "covering-test c.js", "measure `bench` - faster"]);
  assert.deepEqual(testPaths(checks), ["a.js", "b.html", "c.js"]);
  assert.equal(isWptTest("testing/web-platform/tests/dom/a.html"), true);
  assert.equal(isWptTest("dom/a.html"), false);
});
