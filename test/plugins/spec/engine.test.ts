import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFunctionAt, parseSpecRefs } from "../../../src/plugins/spec/runtime/searchfox.ts";
import { codeUrl, engineActivity, engineMapping, engineTasks, followQuote, nothingFound, fragmentOf, innermostFunction, isCodePath, keepAlignedSteps, linksAnchor, mappedSteps, mappingKey, mergeLatest, quoteProblem, siteKey, siteName } from "../../../src/plugins/spec/shared/engine.ts";
import type { EngineMapping, EngineSite } from "../../../src/plugins/spec/shared/types.ts";

const fixture = (name: string) => readFileSync(new URL(`../../fixtures/searchfox/${name}`, import.meta.url), "utf8");

test("quoteProblem: the trimmed quote must be on its line of an existing file", () => {
  const file = "int a;\nvoid Navigate() {\n  if (!doc) return;\n}";
  const ref = (line: number, quote: string, path = "a.cc") => ({ path, line, quote });
  assert.equal(quoteProblem(file, ref(3, " if (!doc) return; ")), null);
  assert.equal(quoteProblem(file, ref(2, "if (!doc) return;")), "a.cc:2 does not read `if (!doc) return;`");
  assert.equal(quoteProblem(file, ref(9, "x")), "a.cc has no line 9");
  assert.equal(quoteProblem(file, ref(1, "  ")), "the quote is empty");
  assert.equal(quoteProblem(null, ref(1, "int a;")), "a.cc does not exist");
});

test("linksAnchor needs the exact fragment, in single-page and multipage URLs (lines from mozilla-central)", () => {
  assert.equal(linksAnchor("// https://html.spec.whatwg.org/#navigate", "navigate"), true);
  assert.equal(linksAnchor("      // https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate", "navigate"), true);
  assert.equal(linksAnchor("// https://html.spec.whatwg.org/#navigate.", "navigate"), true);
  assert.equal(linksAnchor('  // navigate" in https://html.spec.whatwg.org/#navigate first step 2 then 6.2.', "navigate"), true);
  assert.equal(linksAnchor('<link rel=help href="https://html.spec.whatwg.org/#navigate">', "navigate"), true);
  assert.equal(linksAnchor("  // https://html.spec.whatwg.org/#navigate-fragid", "navigate"), false);
  assert.equal(linksAnchor("// https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate-to-a-javascript:-url,", "navigate"), false);
  assert.equal(linksAnchor("// https://html.spec.whatwg.org/#navigate-to-a-javascript:-url.", "navigate-to-a-javascript:-url"), true);
  assert.equal(linksAnchor("// https://html.spec.whatwg.org/#fire-a-push%2Freplace%2Freload-navigate-event", "fire-a-push/replace/reload-navigate-event"), true);
  assert.equal(linksAnchor("// we navigate here", "navigate"), false);
});

test("fragmentOf trims trailing punctuation", () => {
  assert.equal(fragmentOf("https://html.spec.whatwg.org/#navigate."), "navigate");
  assert.equal(fragmentOf("https://html.spec.whatwg.org/#history-traversal:"), "history-traversal");
  assert.equal(fragmentOf("https://html.spec.whatwg.org/"), "");
});

test("isCodePath drops documentation and dot directories from the captured #navigate references", () => {
  const code = parseSpecRefs(fixture("navigate-spec-refs.md")).filter((ref) => ref.group === "Code");
  assert.equal(code.length, 32);
  assert.equal(code.filter((ref) => isCodePath(ref.path)).length, 18);
  assert.equal(isCodePath("dom/docs/navigation.rst"), false);
  assert.equal(isCodePath("testing/web-platform/tests/a.html"), true);
});

test("innermostFunction skips namespaces and types", () => {
  assert.equal(innermostFunction(parseFunctionAt(fixture("function-at-inside.txt")))?.signature, "void BrowsingContext::Navigate(");
  assert.equal(innermostFunction(parseFunctionAt(fixture("function-at-namespace.txt"))), null);
  assert.equal(innermostFunction(parseFunctionAt(fixture("function-at-class.txt"))), null);
  assert.equal(innermostFunction(parseFunctionAt(fixture("function-at-js.txt")))?.symbol, "#M-buildOptionList");
  assert.equal(innermostFunction([]), null);
});

test("siteName is the qualified name before the parameter list, else the place", () => {
  const site = (signature: string) => ({ signature, path: "dom/a.cpp", line: 3 });
  assert.equal(siteName(site("void BrowsingContext::Navigate(")), "BrowsingContext::Navigate");
  assert.equal(siteName(site("MOZ_CAN_RUN_SCRIPT bool FireTraverseNavigateEvent(")), "FireTraverseNavigateEvent");
  assert.equal(siteName(site("function buildOptionList(select, group, uniqueStyles) {")), "buildOptionList");
  assert.equal(siteName(site("mozilla::dom::NavigationType GetNavigationType() const;")), "GetNavigationType");
  assert.equal(siteName(site("class nsDocShellLoadState final {")), "dom/a.cpp:3");
});

test("followQuote keeps, moves or loses a quoted line, and treats two equally near copies as gone", () => {
  const lines = ["a", "  Edit();", "b", "Edit();", "c"];
  assert.equal(followQuote(lines, 2, "Edit();"), 2);
  assert.equal(followQuote(lines, 5, "Edit();"), 4);
  assert.equal(followQuote(lines, 1, "Gone();"), null);
  assert.equal(followQuote(["Edit();", "a", "b", "c", "Edit();"], 3, "Edit();"), null);
  assert.equal(followQuote(["Edit();", "a", "b", "Edit();"], 3, "Edit();"), 4);
});

test("keys, permalinks and stored values", () => {
  assert.equal(mappingKey("gecko", "HTML#navigate"), "impl|gecko|HTML#navigate");
  assert.equal(siteKey({ path: "a.cpp", symbol: "_Z1av", line: 3 }), "a.cpp|_Z1av");
  assert.equal(siteKey({ path: "a.h", symbol: "", line: 3 }), "a.h:3");
  assert.equal(codeUrl({ engine: "gecko", repoBase: "https://searchfox.org/mozilla-central/", rev: "0f".repeat(20) }, "dom/a.cpp", 4), `https://searchfox.org/mozilla-central/rev/${"0f".repeat(20)}/dom/a.cpp#4`);
  assert.equal(codeUrl({ engine: "webkit", repoBase: "https://searchfox.org/wubkat/", rev: "6b" }, "Source/a.cpp", 4), "https://searchfox.org/wubkat/rev/6b/Source/a.cpp#4");
  assert.equal(codeUrl({ engine: "blink", repoBase: "https://source.chromium.org/chromium/chromium/src/", rev: "main" }, "third_party/a.cc", 4), "https://source.chromium.org/chromium/chromium/src/+/main:third_party/a.cc;l=4");
  assert.throws(() => engineMapping({ engine: "gecko" }), /unexpected shape/);
  const validSite: EngineSite = { path: "a.cpp", line: 1, symbol: "A", signature: "void A() {", quote: "void A() {", method: "spec-link", refs: [], steps: [] };
  const validMapping: EngineMapping = { engine: "gecko", repoBase: "r/", rev: "x", checkedAt: "t", sites: [validSite], tests: [], rejected: [] };
  assert.throws(() => engineMapping({ ...validMapping, sites: [{ ...validSite, steps: [{ step: "1", line: 1, verdict: "proposed", detail: "", origin: "bogus" }] }] }), /unexpected shape/);
});

test("mergeLatest keeps rejections, confirmations and proposals stored while a mapping ran", () => {
  const site = (path: string, line: number, method: EngineSite["method"]): EngineSite => ({ path, line, symbol: `_Z${path}`, signature: `void ${path}() {`, quote: `void ${path}() {`, method, refs: [], steps: [] });
  const base = { engine: "gecko" as const, repoBase: "r/", rev: "x", tests: [], checkedAt: "t" };
  const result: EngineMapping = { ...base, rejected: [], sites: [site("a", 1, "spec-link"), site("b", 5, "llm"), site("c", 9, "llm")] };
  const latest: EngineMapping = { ...base, rejected: [{ path: "c", line: 9, symbol: "_Zc", signature: "void c() {" }], sites: [site("a", 3, "spec-link"), site("b", 5, "user"), site("d", 20, "llm"), site("e", 30, "spec-link")] };
  const merged = mergeLatest(result, latest);
  assert.deepEqual(merged.sites.map((s) => [s.path, s.line, s.method]), [["a", 1, "spec-link"], ["b", 5, "user"], ["d", 20, "llm"]]);
  assert.deepEqual(merged.rejected.map((r) => r.path), ["c"]);
});

const alignmentSite = (path: string, line: number, method: EngineSite["method"], extra: Partial<EngineSite> = {}): EngineSite => ({ path, line, symbol: `_Z${path}`, signature: `void ${path}() {`, quote: `void ${path}() {`, method, refs: [], steps: [], ...extra });
const aligned = (step: string, line: number, end: number) => ({ step, line, end, quote: "x", verdict: "proposed" as const, detail: "why", origin: "align" as const });

test("keepAlignedSteps moves a re-derived site's proposed steps with it, also when tier 1 now finds a site the user confirmed", () => {
  const before = [alignmentSite("a", 10, "spec-link", { steps: [aligned("1", 11, 12), { step: "2", line: 11, verdict: "match", detail: "" }] }), alignmentSite("b", 1, "user", { steps: [aligned("3", 2, 2)] })];
  const kept = keepAlignedSteps(before, [alignmentSite("a", 15, "spec-link", { steps: [{ step: "2", line: 16, verdict: "match", detail: "" }] }), alignmentSite("b", 5, "spec-link")]);
  assert.deepEqual(kept.map((site) => site.steps), [[{ step: "2", line: 16, verdict: "match", detail: "" }, aligned("1", 16, 17)], [aligned("3", 6, 6)]]);
});

test("mergeLatest also keeps the step alignments stored while a mapping ran, moved with their site", () => {
  const base = { engine: "blink" as const, repoBase: "r/", rev: "main", tests: [], checkedAt: "t" };
  const match = { step: "3", line: 4, verdict: "match" as const, detail: "" };
  const result = { ...base, rejected: [], sites: [alignmentSite("a", 3, "spec-link-heuristic", { steps: [match, aligned("1", 4, 5)] }), alignmentSite("b", 5, "llm", { steps: [aligned("1", 6, 6)] }), alignmentSite("c", 9, "llm")] };
  const latest = { ...base, rejected: [{ path: "c", line: 9, symbol: "_Zc", signature: "void c() {" }], sites: [alignmentSite("a", 1, "spec-link-heuristic", { steps: [aligned("2", 2, 3)] }), alignmentSite("b", 5, "user"), alignmentSite("c", 9, "llm"), alignmentSite("d", 20, "llm")] };
  const merged = mergeLatest(result, latest);
  assert.deepEqual(merged.sites.map((s) => [s.path, s.method, s.steps]), [["a", "spec-link-heuristic", [match, aligned("2", 4, 5)]], ["b", "user", []], ["d", "llm", []]], "the steps proposed by the end of the run replace those the run started with");
  assert.deepEqual(merged.rejected.map((r) => r.path), ["c"]);
});

test("mappedSteps lists a step's comments across live sites; engineActivity reads one engine's tasks of an algorithm", () => {
  const step = (s: string, line: number) => ({ step: s, line, verdict: "match" as const, detail: "" });
  const site = (path: string, steps: ReturnType<typeof step>[], stale?: true) => ({ path, line: 1, symbol: `_Z${path}`, signature: "", quote: "", method: "spec-link" as const, refs: [1], steps, ...(stale ? { stale } : {}) });
  const mapping: EngineMapping = { engine: "gecko", repoBase: "r/", rev: "x", tests: [], rejected: [], checkedAt: "", sites: [site("a", [step("1", 3), step("2", 5)]), site("b", [step("1", 9)]), site("c", [step("1", 4)], true)] };
  assert.deepEqual(mappedSteps(mapping, "1").map(({ site, step }) => `${site.path}:${step.line}`), ["a:3", "b:9"]);
  assert.deepEqual(mappedSteps(mapping, "7"), []);
  const task = (kind: string, status: string, algorithmId: string, engine = "gecko", error: string | null = null) => ({ kind, status, input: { algorithmId, engine }, error }) as never;
  const tasks = [task("mapEngine", "running", "A"), task("findImplementation", "succeeded", "A"), task("findImplementation", "pending", "B"), task("findImplementation", "running", "A", "blink")];
  assert.deepEqual(engineActivity(tasks, "A", "gecko"), { mapping: true, searching: false, aligning: false, error: null });
  assert.deepEqual(engineActivity(tasks, "A", "blink"), { mapping: false, searching: true, aligning: false, error: null });
});

test("engineTasks keeps running tasks and a failed task only while it is the latest of its kind, algorithm and engine", () => {
  const task = (kind: string, status: string, algorithmId: string, error: string | null = null) => ({ kind, status, input: { algorithmId, engine: "gecko" }, error }) as never;
  const failedThenRunning = [task("findImplementation", "failed", "A", "boom"), task("findImplementation", "running", "A")];
  assert.deepEqual(engineTasks(failedThenRunning), [failedThenRunning[1]]);
  const failedThenSucceeded = [task("findImplementation", "failed", "A", "boom"), task("findImplementation", "succeeded", "A")];
  assert.deepEqual(engineTasks(failedThenSucceeded), []);
  const failed = [task("findImplementation", "failed", "A", "old"), task("findImplementation", "failed", "A", "new"), task("mapEngine", "failed", "B", "map"), task("loadSpecAlgorithm", "failed", "A", "other")];
  assert.deepEqual(engineTasks(failed), [failed[1], failed[2]]);
  assert.equal(engineActivity(engineTasks(failed), "A", "gecko").error, "new");
  const aligns = [task("alignSteps", "running", "A"), task("alignSteps", "failed", "B", "x")];
  assert.deepEqual(engineTasks(aligns), aligns);
  assert.deepEqual(engineActivity(aligns, "A", "gecko"), { mapping: false, searching: false, aligning: true, error: null });
});

test("nothingFound: the latest finished search of an engine found nothing, with its dropped candidates' reasons", () => {
  const find = (status: "running" | "succeeded" | "failed", output: unknown = null, engine = "webkit") => ({ kind: "findImplementation", status, input: { algorithmId: "A", engine }, output });
  const none = find("succeeded", { sites: [], dropped: [{ reason: "x.cc:3 does not read `y`" }] });
  assert.deepEqual(nothingFound([none], "A", "webkit"), { note: "No WebKit match found; 1 candidate failed the check", reasons: ["x.cc:3 does not read `y`"] });
  assert.deepEqual(nothingFound([find("succeeded", { sites: [], dropped: [] })], "A", "webkit"), { note: "No WebKit match found", reasons: [] });
  assert.equal(nothingFound([none, find("running")], "A", "webkit"), null);
  assert.equal(nothingFound([find("succeeded", { sites: [{}], dropped: [] })], "A", "webkit"), null);
  assert.equal(nothingFound([none], "A", "blink"), null);
});
