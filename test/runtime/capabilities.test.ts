import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeWebspec } from "../../src/runtime/webspec.ts";
import { isGeckoRepo, makeSearchfox, parseSpecRefs } from "../../src/runtime/searchfox.ts";

const STUB = fileURLToPath(new URL("../stubs/fake-llm.mjs", import.meta.url));
const FAKE = fileURLToPath(new URL("../stubs/fake-webspec.mjs", import.meta.url));
const NAVIGATE = readFileSync(new URL("../fixtures/webspec/navigate-query.json", import.meta.url), "utf8");
const NAVIGATE_EFFECTS = readFileSync(new URL("../fixtures/webspec/navigate-effects.json", import.meta.url), "utf8");
const signal = new AbortController().signal;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cap-"));
  process.env.FAKE_LLM_LOG = join(dir, "log.jsonl");
  for (const k of ["FAKE_LLM_STDOUT", "FAKE_LLM_STDERR", "FAKE_LLM_EXIT", "FAKE_LLM_SLEEP_MS"]) delete process.env[k];
});
const stdout = (s: string) => {
  writeFileSync(join(dir, "out"), s);
  process.env.FAKE_LLM_STDOUT = join(dir, "out");
};
const argv = () => readFileSync(process.env.FAKE_LLM_LOG!, "utf8").trim().split("\n").map((l) => JSON.parse(l).argv);

test("webspec: found", async () => {
  stdout(JSON.stringify({ spec: "HTML", anchor: "navigate", title: "navigate", type: "algorithm", url: "https://html.spec.whatwg.org/#navigate", content: "To **navigate**...", sha: "x" }));
  const r = await makeWebspec({ bin: STUB }).resolve("https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate", signal);
  assert.deepEqual(r, { found: true, spec: { spec: "HTML", anchor: "navigate", title: "navigate", type: "algorithm", url: "https://html.spec.whatwg.org/#navigate", content: "To **navigate**..." } });
  assert.deepEqual(argv()[0], ["query", "https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate", "--format", "json"]);
});

test("webspec: not found is a value, other failures throw", async () => {
  process.env.FAKE_LLM_EXIT = "1";
  process.env.FAKE_LLM_STDERR = "Error: Section not found: HTML#nope\n";
  assert.deepEqual(await makeWebspec({ bin: STUB }).resolve("https://html.spec.whatwg.org/#nope", signal), { found: false, reason: "Section not found: HTML#nope" });
  process.env.FAKE_LLM_EXIT = "101";
  process.env.FAKE_LLM_STDERR = "thread 'main' panicked";
  await assert.rejects(makeWebspec({ bin: STUB }).resolve("x", signal), /webspec-index exited with code 101: thread 'main' panicked/);
  await assert.rejects(makeWebspec({ bin: "/nonexistent/webspec-index" }).resolve("x", signal), /Cannot run/);
});

test("webspec: query keeps the section fields", async () => {
  stdout(NAVIGATE);
  const r = await makeWebspec({ bin: STUB }).query("HTML#navigate", signal);
  assert.equal(r.found, true);
  if (!r.found) return;
  assert.deepEqual({ ...r.section, content: r.section.content.slice(0, 16), effects: r.section.effects.length }, { spec: "HTML", anchor: "navigate", title: "navigate", type: "algorithm", url: "https://html.spec.whatwg.org/#navigate", content: "To **navigate** ", outgoingRefs: 153, effects: 12, effectsStatus: JSON.parse(NAVIGATE).effects_status, sha: JSON.parse(NAVIGATE).sha });
  assert.deepEqual(argv()[0], ["query", "HTML#navigate", "--format", "json"]);
});

test("webspec: query not found is a value; output without a sha throws", async () => {
  process.env.FAKE_LLM_EXIT = "1";
  process.env.FAKE_LLM_STDERR = "Error: Unknown spec: FOO\n";
  try {
    assert.deepEqual(await makeWebspec({ bin: STUB }).query("FOO#bar", signal), { found: false, reason: "Unknown spec: FOO" });
  } finally {
    delete process.env.FAKE_LLM_EXIT; delete process.env.FAKE_LLM_STDERR;
  }
  stdout(JSON.stringify({ ...JSON.parse(NAVIGATE), sha: undefined }));
  await assert.rejects(makeWebspec({ bin: STUB }).query("HTML#navigate", signal), /webspec-index query output for HTML#navigate lacks sha, effects or outgoing_refs/);
});

test("webspec: search maps the results", async () => {
  stdout(JSON.stringify({ query: "navigate", results: [{ spec: "HTML", anchor: "navigate", title: "navigate", type: "algorithm", snippet: "s", extra: 1 }] }));
  assert.deepEqual(await makeWebspec({ bin: STUB }).search("navigate", signal), [{ spec: "HTML", anchor: "navigate", title: "navigate", type: "algorithm", snippet: "s" }]);
  assert.deepEqual(argv()[0], ["search", "navigate", "--format", "json"]);
});

test("webspec: effectPaths reduces witness hops to their sites", async () => {
  stdout(NAVIGATE_EFFECTS);
  const paths = await makeWebspec({ bin: STUB }).effectPaths("HTML#navigate", "ef_e6c5f8c3e2980985", signal);
  assert.equal(paths.effects.length, 39);
  assert.equal(paths.explanations[0]!.effectId, "ef_e6c5f8c3e2980985");
  assert.deepEqual(paths.explanations[0]!.witnesses[0]![0], { from: { spec: "HTML", anchor: "navigate" }, to: { spec: "HTML", anchor: "navigate", step_path: [8] }, site: { spec: "HTML", anchor: "navigate", step_path: [8] } });
  assert.deepEqual(argv()[0], ["effects", "HTML#navigate", "--effect-id", "ef_e6c5f8c3e2980985"]);
  await makeWebspec({ bin: STUB }).effectPaths("HTML#navigate", null, signal);
  assert.deepEqual(argv()[1], ["effects", "HTML#navigate"]);
});

test("fake webspec serves the navigate fixtures, generic algorithms and search", async () => {
  const webspec = makeWebspec({ bin: FAKE });
  const navigate = await webspec.query("HTML#navigate", signal);
  assert.equal(navigate.found && navigate.section.sha, JSON.parse(NAVIGATE).sha);
  const other = await webspec.query("WEBIDL#wait-for-all", signal);
  assert.deepEqual(other.found && { spec: other.section.spec, sha: other.section.sha, effects: other.section.effects }, { spec: "WEBIDL", sha: "fake-wait-for-all", effects: [] });
  assert.equal((await webspec.effectPaths("HTML#navigate", null, signal)).explanations.length, 39);
  assert.deepEqual(await webspec.effectPaths("HTML#setup", null, signal), { effects: [], explanations: [] });
  assert.deepEqual((await webspec.search("navigate", signal)).map((r) => `${r.spec}#${r.anchor}`), ["HTML#navigate", "HTML#navigate-fragid"]);
  assert.deepEqual(await webspec.query("nope", signal), { found: false, reason: "URL not recognized: nope" });
});

const SPEC_REFS = `## Gecko references for https://html.spec.whatwg.org/#navigate

3 reference(s) in mozilla-central

### Code

- dom/navigation/Navigation.cpp:120 — https://searchfox.org/firefox-main/source/dom/navigation/Navigation.cpp#120
- docshell/base/nsDocShell.cpp:9001 — https://searchfox.org/firefox-main/source/docshell/base/nsDocShell.cpp#9001

### Web-Platform Test

- testing/web-platform/tests/navigation-api/a.html:5 — https://searchfox.org/firefox-main/source/testing/web-platform/tests/navigation-api/a.html#5
`;

test("parseSpecRefs", () => {
  assert.deepEqual(parseSpecRefs(SPEC_REFS), [
    { group: "Code", path: "dom/navigation/Navigation.cpp", line: 120, url: "https://searchfox.org/firefox-main/source/dom/navigation/Navigation.cpp#120" },
    { group: "Code", path: "docshell/base/nsDocShell.cpp", line: 9001, url: "https://searchfox.org/firefox-main/source/docshell/base/nsDocShell.cpp#9001" },
    { group: "Web-Platform Test", path: "testing/web-platform/tests/navigation-api/a.html", line: 5, url: "https://searchfox.org/firefox-main/source/testing/web-platform/tests/navigation-api/a.html#5" },
  ]);
  assert.deepEqual(parseSpecRefs("## Gecko references for x\n\n0 reference(s) in mozilla-central\n"), []);
});

test("searchfox: specRefs args and failure", async () => {
  stdout(SPEC_REFS);
  const sf = makeSearchfox({ bin: STUB });
  assert.equal((await sf.specRefs("https://html.spec.whatwg.org/#navigate", signal)).length, 3);
  assert.deepEqual(argv()[0], ["--spec-refs", "https://html.spec.whatwg.org/#navigate", "-l", "30"]);
  process.env.FAKE_LLM_EXIT = "1";
  process.env.FAKE_LLM_STDERR = "network unreachable";
  await assert.rejects(sf.specRefs("u", signal), /searchfox-cli exited with code \d+: network unreachable/);
});

test("searchfox: define parses a permalink and matching source line", async () => {
  const rev = "0123456789012345678901234567890123456789";
  stdout(`https://searchfox.org/firefox-main/rev/${rev}/dom/base/nsGlobalWindowOuter.cpp#5482-5528\n>>> 5482: void nsGlobalWindowOuter::SizeToContentOuter(\n    5483: …\n`);
  const sf = makeSearchfox({ bin: STUB });
  assert.deepEqual(await sf.define("nsGlobalWindowOuter::SizeToContentOuter", signal), {
    path: "dom/base/nsGlobalWindowOuter.cpp", line: 5482,
    text: "void nsGlobalWindowOuter::SizeToContentOuter(",
  });
  assert.deepEqual(argv().sort((a, b) => a.join(" ").localeCompare(b.join(" "))), [
    ["--define", "nsGlobalWindowOuter::SizeToContentOuter"],
    ["--define", "nsGlobalWindowOuter::SizeToContentOuter", "--permalink"],
  ]);
});

test("searchfox: define returns null when either result is absent and throws on failure", async () => {
  stdout("");
  const sf = makeSearchfox({ bin: STUB });
  assert.equal(await sf.define("missing", signal), null);
  stdout(">>> 5482: source line\n");
  assert.equal(await sf.define("missing", signal), null);
  stdout("");
  process.env.FAKE_LLM_EXIT = "1";
  process.env.FAKE_LLM_STDERR = "network unreachable";
  await assert.rejects(sf.define("broken", signal), /searchfox-cli exited with code \d+: network unreachable/);
});

test("searchfox: tip parsed and cached; bad output throws and is not cached", async () => {
  stdout("https://searchfox.org/firefox-main/rev/b4b9efb6ee130740a94caf46ffff0625af1d51db/moz.build#1\n");
  const sf = makeSearchfox({ bin: STUB });
  assert.deepEqual(await sf.tip(), { repoBase: "https://searchfox.org/firefox-main/", rev: "b4b9efb6ee130740a94caf46ffff0625af1d51db" });
  assert.deepEqual(await sf.tip(), { repoBase: "https://searchfox.org/firefox-main/", rev: "b4b9efb6ee130740a94caf46ffff0625af1d51db" });
  assert.equal(argv().length, 1);
  assert.deepEqual(argv()[0], ["--get-file", "moz.build", "--lines", "1", "--permalink"]);
  stdout("garbage");
  const sf2 = makeSearchfox({ bin: STUB });
  await assert.rejects(sf2.tip(), /Unexpected searchfox-cli permalink output/);
  stdout("https://searchfox.org/mozilla-central/rev/0123456789012345678901234567890123456789/moz.build#1");
  assert.deepEqual(await sf2.tip(), { repoBase: "https://searchfox.org/mozilla-central/", rev: "0123456789012345678901234567890123456789" });
});

test("isGeckoRepo", () => {
  assert.equal(isGeckoRepo(dir), false);
  writeFileSync(join(dir, "mach"), "");
  writeFileSync(join(dir, "moz.build"), "");
  assert.equal(isGeckoRepo(dir), true);
  assert.ok(existsSync(join(dir, "mach")));
});
