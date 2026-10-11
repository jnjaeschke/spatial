import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability } from "../../../src/runtime/tasks.ts";
import { KnowledgeStore } from "../../../src/runtime/knowledge.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import { corePlugin } from "../../../src/runtime/create.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { openSpec } from "../../../src/plugins/spec/runtime/open.ts";
import { ensureMapping, storedMapping, updateMapping } from "../../../src/plugins/spec/runtime/mappings.ts";
import { specRoutes } from "../../../src/plugins/spec/server/routes.ts";
import type { EngineMapping, EngineSite, SpecAlgorithmData } from "../../../src/plugins/spec/shared/types.ts";
import { routeCall } from "../../helpers/route-call.ts";

const DAY = 24 * 60 * 60 * 1000;
const FILE = ["// https://html.spec.whatwg.org/#setup", "void Setup() {", "  // Step 1. Edit the line.", "  Edit();", "  // Step 2. Add the files.", "}", ""].join("\n");
const SETUP = { symbol: "_Z5Setupv", signature: "void Setup() {" };

function setup() {
  const calls: string[] = [];
  const tip = { rev: "a".repeat(40) };
  const gate = { hold: Promise.resolve() as Promise<void> };
  const searchfox: SearchfoxCapability = {
    effect: "read-only",
    async define() { return null; },
    async specRefs(url) { await gate.hold; calls.push(`specRefs ${url}`); return url.endsWith("#setup") ? [{ group: "Code", path: "dom/Setup.cpp", line: 1, url: "https://searchfox.org/mozilla-central/source/dom/Setup.cpp#1" }] : []; },
    async functionAt(path, line) { return path === "dom/Setup.cpp" && line >= 2 && line <= 6 ? [SETUP] : []; },
    async file(path) { if (path !== "dom/Setup.cpp") throw new Error("searchfox-cli exited with code 1: Error: Request failed: 404 Not Found"); return FILE; },
    async tip() { calls.push("tip"); return { repoBase: "https://searchfox.org/mozilla-central/", rev: tip.rev }; },
  };
  const webspec = {
    effect: "read-only" as const,
    async query(ref: string) { const anchor = ref.split("#").at(-1)!; return { found: true as const, section: { spec: "HTML", anchor, title: anchor, type: "algorithm", url: `https://html.spec.whatwg.org/#${anchor}`, content: "1. Edit the line.\n2. Add the files.", outgoingRefs: 0, effects: [], effectsStatus: { state: "ready", semantics: "may", issues: [], omitted: 0 }, sha: `fake-${anchor}` } }; },
    async effectPaths() { return { effects: [], explanations: [] }; },
    async analyze(_name: string, text: string) { return text.split("\n").flatMap((line, index) => { const match = /\/\/ Step (\d+)\. (.*)/.exec(line); return match ? [{ line: index + 1, step: match[1]!, text: match[2]!, result: match[2] === "Edit the line." ? "exact" as const : "mismatch" as const, url: "https://html.spec.whatwg.org/#setup" }] : []; }); },
  } as never;
  const rt = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, specPlugin], llm: {} as LlmService, git: () => ({}) as GitCapability, webspec, searchfox, knowledge: new KnowledgeStore(":memory:") });
  const session = rt.store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  return { rt, session, calls, tip, gate };
}
async function algorithm(rt: Runtime, sessionId: string, ref = "HTML#setup") {
  const { algorithmId } = await rt.run<{ algorithmId: string }>(sessionId, "loadSpecAlgorithm", { ref });
  return rt.store.getArtifact<SpecAlgorithmData>(algorithmId);
}
const old = (sites: EngineSite[], rejected: EngineMapping["rejected"] = []): EngineMapping => ({ engine: "gecko", repoBase: "https://searchfox.org/mozilla-central/", rev: "0".repeat(40), checkedAt: new Date(Date.now() - 3 * DAY).toISOString(), tests: [], sites, rejected });
const EDIT: EngineSite = { path: "dom/Setup.cpp", line: 4, symbol: "_Z4Editv", signature: "void Edit() {", quote: "Edit();", method: "llm", refs: [], steps: [], why: "It edits." };

test("tiers 1 and 2 map an algorithm to its function and Step comments, stored as a plugin fact", async () => {
  const { rt, session } = setup();
  await ensureMapping(rt, session.id, "gecko", await algorithm(rt, session.id));
  const read = rt.knowledge.get("global", "spec", "impl|gecko|HTML#setup");
  if (read.state !== "current") throw new Error(`mapping is ${read.state}`);
  assert.equal(read.entry.provenance.by, "plugin");
  assert.deepEqual({ ...(read.entry.value as EngineMapping), checkedAt: "" }, { engine: "gecko", repoBase: "https://searchfox.org/mozilla-central/", rev: "a".repeat(40), checkedAt: "", tests: [], rejected: [], sites: [
    { path: "dom/Setup.cpp", line: 2, symbol: "_Z5Setupv", signature: "void Setup() {", quote: "void Setup() {", method: "spec-link", refs: [1], steps: [
      { step: "1", line: 3, verdict: "match", detail: "webspec-index: exact. The comment says: “Edit the line.”" },
      { step: "2", line: 5, verdict: "mismatch", detail: "webspec-index: mismatch. The comment says: “Add the files.”" },
    ] },
  ] });
});

test("a mapping is recomputed only after a day and when the code search moved on", async () => {
  const { rt, session, calls, tip } = setup();
  const a = await algorithm(rt, session.id);
  await ensureMapping(rt, session.id, "gecko", a);
  const runs = () => calls.filter((call) => call.startsWith("specRefs")).length;
  assert.equal(runs(), 1);
  calls.length = 0;
  await ensureMapping(rt, session.id, "gecko", a, Date.now() + DAY / 2);
  assert.deepEqual(calls, []);
  await ensureMapping(rt, session.id, "gecko", a, Date.now() + 2 * DAY);
  assert.deepEqual(calls, ["tip"]);
  tip.rev = "b".repeat(40);
  await ensureMapping(rt, session.id, "gecko", a, Date.now() + 2 * DAY);
  assert.equal(runs(), 1);
  assert.equal(storedMapping(rt.knowledge, "gecko", "HTML#setup")!.rev, "b".repeat(40));
});

test("concurrent opens start one mapping run; opening a box maps it in Gecko", async () => {
  const { rt, session } = setup();
  const a = await algorithm(rt, session.id);
  await Promise.all([ensureMapping(rt, session.id, "gecko", a), ensureMapping(rt, session.id, "gecko", a)]);
  assert.equal(rt.store.listTasks(session.id).filter((task) => task.kind === "mapEngine").length, 1);
  const mapped = new Promise<unknown>((resolve) => rt.onEvent((event) => { if (event.type === "spec.mapping" && (event.payload as { ref: string }).ref === "HTML#other") resolve(event.payload); }));
  await openSpec(rt, session.id, "HTML#other", null);
  assert.deepEqual(await mapped, { ref: "HTML#other", engine: "gecko" });
  assert.deepEqual(storedMapping(rt.knowledge, "gecko", "HTML#other")!.sites, []);
});

test("a refresh keeps an LLM site whose quote is still there and the rejections; the route lists one engine's mappings by ref", async () => {
  const { rt, session } = setup();
  const a = await algorithm(rt, session.id);
  await algorithm(rt, session.id, "HTML#other");
  const rejected = [{ path: "dom/X.cpp", line: 1, symbol: "_Z1Xv", signature: "void X() {" }];
  rt.knowledge.put("global", "spec", "impl|gecko|HTML#setup", old([EDIT], rejected), { by: "llm", taskId: "T", sessionId: session.id });
  await ensureMapping(rt, session.id, "gecko", a);
  const mapping = storedMapping(rt.knowledge, "gecko", "HTML#setup")!;
  assert.deepEqual(mapping.sites.map((site) => [site.method, site.line]), [["spec-link", 2], ["llm", 4]]);
  assert.deepEqual(mapping.rejected, rejected);
  const routes = specRoutes(rt);
  assert.deepEqual(await routeCall(routes, "GET", `/api/sessions/${session.id}/spec/mappings?engine=gecko`), { status: 200, body: { "HTML#setup": mapping, "HTML#other": null } });
  assert.deepEqual(await routeCall(routes, "GET", `/api/sessions/${session.id}/spec/mappings?engine=blink`), { status: 200, body: { "HTML#setup": null, "HTML#other": null } });
  assert.equal((await routeCall(routes, "GET", `/api/sessions/${session.id}/spec/mappings?engine=servo`)).status, 400);
});

test("updateMapping changes the latest value, writes nothing for null, and emits the engine", async () => {
  const { rt, session } = setup();
  const events: unknown[] = [];
  rt.onEvent((event) => { if (event.type === "spec.mapping") events.push(event.payload); });
  const by = { by: "user" as const, sessionId: session.id };
  assert.equal(updateMapping(rt, session.id, "gecko", "HTML#setup", by, () => null), null);
  updateMapping(rt, session.id, "gecko", "HTML#setup", by, (current) => { assert.equal(current, null); return old([EDIT]); });
  updateMapping(rt, session.id, "gecko", "HTML#setup", by, (current) => ({ ...current!, rejected: [{ path: "x.cpp", line: 1, symbol: "X", signature: "void X() {" }] }));
  assert.deepEqual(storedMapping(rt.knowledge, "gecko", "HTML#setup")!.rejected.map((r) => r.path), ["x.cpp"]);
  assert.deepEqual(events, [{ ref: "HTML#setup", engine: "gecko" }, { ref: "HTML#setup", engine: "gecko" }]);
});

test("a confirmation stored while a mapping runs survives the mapping's write", async () => {
  const { rt, session, gate } = setup();
  const a = await algorithm(rt, session.id);
  rt.knowledge.put("global", "spec", "impl|gecko|HTML#setup", old([EDIT]), { by: "llm", taskId: "T", sessionId: session.id });
  let release!: () => void;
  gate.hold = new Promise<void>((resolve) => { release = resolve; });
  const running = ensureMapping(rt, session.id, "gecko", a);
  await new Promise((resolve) => setImmediate(resolve));
  updateMapping(rt, session.id, "gecko", "HTML#setup", { by: "user", sessionId: session.id }, (current) => ({ ...current!, sites: current!.sites.map((site) => ({ ...site, method: "user" as const })) }));
  release();
  await running;
  assert.deepEqual(storedMapping(rt.knowledge, "gecko", "HTML#setup")!.sites.map((site) => [site.method, site.line]), [["spec-link", 2], ["user", 4]]);
});
