import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, type GitCapability } from "../../../src/runtime/tasks.ts";
import { KnowledgeStore } from "../../../src/runtime/knowledge.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import type { LlmSelection } from "../../../src/shared/types.ts";
import { corePlugin } from "../../../src/runtime/create.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { makeWebspec } from "../../../src/runtime/webspec.ts";
import { startSearch, storedMapping } from "../../../src/plugins/spec/runtime/mappings.ts";
import { specRoutes } from "../../../src/plugins/spec/server/routes.ts";
import type { EngineMapping, EngineSite, SpecAlgorithmData } from "../../../src/plugins/spec/shared/types.ts";
import { routeCall } from "../../helpers/route-call.ts";
import { CANDIDATE, NAVIGATE_SITE, mapping, searchfox } from "./gecko-fakes.ts";

const KEY = `docshell/base/BrowsingContext.cpp|${NAVIGATE_SITE.symbol}`;

function setup() {
  const gate = { candidates: [] as unknown[], hold: Promise.resolve() };
  const DEFAULT: LlmSelection = { backend: "claude", model: "sonnet", effort: "low" };
  const llm = { defaultSelection: DEFAULT, async run(selection: LlmSelection | undefined) { await gate.hold; return { text: "", json: { candidates: gate.candidates }, providerSessionId: "p", selection: selection ?? DEFAULT }; }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } } as LlmService;
  const fakeWebspec = makeWebspec({ bin: fileURLToPath(new URL("../../stubs/fake-webspec.mjs", import.meta.url)) });
  const webspec = { ...fakeWebspec, async query(ref: string) { const anchor = ref.split("#")[1]!; return { found: true as const, section: { spec: "HTML", anchor, title: anchor, type: "algorithm", url: `https://html.spec.whatwg.org/#${anchor}`, content: "1. Edit the line.\n2. Add the file.", outgoingRefs: 0, effects: [], effectsStatus: { state: "ready" as const, semantics: "may" as const, issues: [], omitted: 0 }, sha: `fake-${anchor}` } }; }, async effectPaths() { return { effects: [], explanations: [] }; }, async refs() { return { incoming: [], outgoing: [] }; } };
  const rt = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, specPlugin], llm, git: () => ({}) as GitCapability, webspec, searchfox, knowledge: new KnowledgeStore(":memory:") });
  const session = rt.store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const put = (value: EngineMapping) => rt.knowledge.put("global", "spec", "impl|gecko|HTML#setup", value, { by: "plugin", sessionId: session.id });
  const entry = () => { const read = rt.knowledge.get("global", "spec", "impl|gecko|HTML#setup"); if (read.state !== "current") throw new Error(`mapping is ${read.state}`); return read.entry; };
  const routes = specRoutes(rt);
  const find = (body: object) => routeCall(routes, "POST", `/api/sessions/${session.id}/spec/mappings/find`, { engine: "gecko", ...body });
  const decide = (body: object) => routeCall(routes, "POST", `/api/sessions/${session.id}/spec/mappings/decide`, { engine: "gecko", ...body });
  return { rt, session, gate, put, entry, find, decide };
}
async function algorithm(rt: Runtime, sessionId: string, ref = "HTML#setup") {
  const { algorithmId } = await rt.run<{ algorithmId: string }>(sessionId, "loadSpecAlgorithm", { ref });
  return rt.store.getArtifact<SpecAlgorithmData>(algorithmId);
}

test("find stores verified candidates as LLM proposals; confirm makes a proposal a user site", async () => {
  const { rt, session, gate, put, entry, find, decide } = setup();
  await algorithm(rt, session.id);
  put(mapping());
  gate.candidates = [CANDIDATE];
  const stored = new Promise<void>((resolve) => rt.onEvent((event) => { if (event.type === "spec.mapping") resolve(); }));
  const found = await find({ ref: "HTML#setup" });
  assert.equal(found.status, 202);
  await stored;
  assert.deepEqual(entry().provenance, { by: "llm", taskId: found.body.taskId, sessionId: session.id });
  assert.deepEqual((entry().value as EngineMapping).sites, [NAVIGATE_SITE]);
  assert.equal((await decide({ ref: "HTML#setup", key: KEY, decision: "confirm" })).status, 201);
  assert.deepEqual(storedMapping(rt.knowledge, "gecko", "HTML#setup")!.sites, [{ ...NAVIGATE_SITE, method: "user" }]);
  assert.equal(entry().provenance.by, "user");
});

test("a rejected proposal leaves the mapping and is not proposed again", async () => {
  const { rt, session, gate, put, entry, decide } = setup();
  const a = await algorithm(rt, session.id);
  put(mapping([NAVIGATE_SITE]));
  assert.equal((await decide({ ref: "HTML#setup", key: KEY, decision: "reject" })).status, 201);
  const rejectedEntry = entry();
  assert.deepEqual(rejectedEntry.value, { ...mapping(), checkedAt: (rejectedEntry.value as EngineMapping).checkedAt, rejected: [{ path: NAVIGATE_SITE.path, line: 2648, symbol: NAVIGATE_SITE.symbol, signature: NAVIGATE_SITE.signature }] });
  gate.candidates = [CANDIDATE];
  await startSearch(rt, session.id, "gecko", a, null).merged;
  assert.equal(entry().id, rejectedEntry.id);
});

test("find again replaces a stale site with the new proposals", async () => {
  const { rt, session, gate, put } = setup();
  const a = await algorithm(rt, session.id);
  const stale: EngineSite = { ...NAVIGATE_SITE, path: "docshell/base/Old.cpp", symbol: "_ZOld", stale: true };
  put(mapping([stale]));
  gate.candidates = [CANDIDATE];
  await startSearch(rt, session.id, "gecko", a, stale).merged;
  assert.deepEqual(storedMapping(rt.knowledge, "gecko", "HTML#setup")!.sites, [NAVIGATE_SITE]);
});

test("find and decide reject bad requests", async () => {
  const { rt, session, gate, put, find, decide } = setup();
  await algorithm(rt, session.id);
  await algorithm(rt, session.id, "HTML#other");
  assert.equal((await find({ ref: "HTML#never-opened" })).status, 404);
  assert.equal((await find({ ref: "HTML#other" })).status, 409);
  assert.equal((await find({ ref: "HTML#setup", engine: "servo" })).status, 400);
  put(mapping([NAVIGATE_SITE]));
  assert.equal((await find({ ref: "HTML#setup", engine: "blink" })).status, 409);
  assert.equal((await find({ ref: "HTML#setup", stale: KEY })).status, 404);
  assert.equal((await decide({ ref: "HTML#setup", key: "nope", decision: "confirm" })).status, 404);
  assert.equal((await decide({ ref: "HTML#setup", key: KEY, decision: "maybe" })).status, 400);
  assert.equal((await decide({ ref: "HTML#setup", key: KEY, decision: "confirm", engine: "servo" })).status, 400);
  let release!: () => void;
  gate.hold = new Promise<void>((resolve) => { release = resolve; });
  assert.equal((await find({ ref: "HTML#setup" })).status, 202);
  assert.equal((await find({ ref: "HTML#setup" })).status, 409);
  release();
});
