// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, type SearchfoxCapability, type WebspecCapability } from "../../../src/runtime/tasks.ts";
import { makeGit } from "../../../src/runtime/git.ts";
import type { LlmPrompt, LlmService } from "../../../src/runtime/llm/types.ts";
import type { LlmSelection } from "../../../src/shared/types.ts";
import { LlmOutputError, type Plugin } from "../../../src/plugin-api.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { geckoPlugin } from "../../../src/plugins/gecko/index.ts";
import type { InvestigationData } from "../../../src/plugins/implement/shared/types.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
const reply = (over: object = {}) => ({
  kind: "bugfix", summary: "S", bug: null, locations: [{ path: "a.txt", line: 3, quote: "beta", why: "w" }],
  testCases: [{ description: "d", expected: "e", actual: null, path: null }], architecture: null,
  steps: [{ title: "T", message: "M", intent: "I", tests: [] }], openQuestions: ["Q?"], exploration: [{ tried: "grep alpha", outcome: "found it" }], specUrls: [], diagram: null, ...over,
});
const step = (symbol: string, line: number) => ({ from: "a", to: "a", symbol, call: `${symbol}()`, what: "w", when: null, guard: null, phase: null, status: "existing", cite: { path: "a.txt", line } });
const diagram = (over: object = {}) => ({ commit: 1, title: "Flow", summary: "S", lanes: [{ id: "a", label: "A", note: null }], steps: [step("beta", 2), step("missing", 2)], before: null, ...over });
const specResult = (url: string) => ({ found: true as const, spec: { spec: "HTML", anchor: "a", title: "T", type: "dfn", url, content: "c" } });
function setup(json: unknown | ((call: number) => unknown), extra: Plugin[] = [], webspec: Partial<WebspecCapability> = {}) {
  const repo = makeRepo();
  const base = repo.commit({ "a.txt": "alpha\nbeta\ngamma\n" }, "base");
  repo.git("switch", "-c", "spatial/x");
  const store = new Store(":memory:");
  const prompts: LlmPrompt[] = [];
  const llm: LlmService = { defaultSelection: selection, async run(chosen, prompt) { prompts.push(prompt); return { text: "", json: typeof json === "function" ? json(prompts.length - 1) : json, providerSessionId: `p${prompts.length}`, selection: chosen ?? selection }; }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
  const rt = new Runtime({ store, plugins: [specPlugin, reviewPlugin, implementPlugin, geckoPlugin, ...extra], llm, git: makeGit, webspec: webspec as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: repo.dir, repoDir: join(repo.dir, ".git"), title: "t" });
  const run = (input: object = {}) => rt.run<{ investigationId: string; droppedLocations: string[] }>(session.id, "investigate", { request: "fix it", profile: "plain-git", baseSha: base, branch: "spatial/x", llm: selection, ...input });
  return { repo, base, store, session, prompts, rt, run };
}

test("locations are verified against the base, corrected and reported when dropped", async () => {
  const { store, run, prompts } = setup(reply({ locations: [
    { path: "a.txt", line: 3, quote: "beta", why: "w" }, { path: "gone.txt", line: 1, quote: "x", why: "w" }, { path: "a.txt", line: 1, quote: "nothere", why: "w" },
  ] }));
  const out = await run();
  const artifact = store.getArtifact<InvestigationData>(out.investigationId);
  assert.equal(artifact.type, "Investigation");
  assert.equal(artifact.status, "proposed");
  assert.ok(artifact.provenance.llm);
  assert.deepEqual(artifact.data.locations.map((l) => [l.path, l.line]), [["a.txt", 2]]);
  assert.equal(out.droppedLocations.length, 2);
  assert.deepEqual(artifact.data.droppedLocations, out.droppedLocations);
  assert.deepEqual(artifact.data.exploration, [{ tried: "grep alpha", outcome: "found it" }]);
  assert.equal(artifact.data.architecture, undefined);
  assert.equal(prompts[0]!.tools, "read-only");
  assert.ok(prompts[0]!.system!.startsWith("You investigate a bug report or feature request"));
  assert.ok(prompts[0]!.prompt.includes("fix it") && prompts[0]!.prompt.includes("spatial/x"));
});

test("bug number must occur in the request", async () => {
  const bugOf = async (request: string, bug: number) => {
    const { store, run } = setup(reply({ bug }));
    return store.getArtifact<InvestigationData>((await run({ request })).investigationId).data.bug;
  };
  assert.equal(await bugOf("fix it", 123), null);
  assert.equal(await bugOf("fix bug 123 please", 123), 123);
  assert.equal(await bugOf("fix bug 1234", 123), null);
  assert.equal(await bugOf("https://bugzilla.mozilla.org/show_bug.cgi?id=123", 123), 123);
});

test("a revision prompt carries the previous investigation, the user's text and chat threads on it", async () => {
  const { store, session, run, prompts } = setup(reply());
  const first = await run();
  const thread = store.putArtifact({ sessionId: session.id, type: "ChatThread", status: "verified", data: { anchor: `${first.investigationId}#step0` }, provenance: { taskId: "user" } });
  const message = store.putArtifact({ sessionId: session.id, type: "ChatMessage", status: "verified", data: { role: "user", text: "why not option X?" }, provenance: { taskId: "user" } });
  store.putLink({ sessionId: session.id, from: message.id, to: thread.id, kind: "reply" });
  await run({ previous: { id: first.investigationId, text: "Use the other approach" } });
  const prompt = prompts[1]!.prompt;
  for (const text of ["# Previous investigation", "grep alpha", "# Revision request", "Use the other approach", "# Chat threads on the previous investigation", "why not option X?"]) assert.ok(prompt.includes(text), text);
});

test("the checkout must be on the recorded branch", async () => {
  const { repo, run } = setup(reply());
  repo.git("switch", "main");
  await assert.rejects(run(), /not on spatial\/x/);
});

test("a single-commit profile takes exactly one step, and a plan needs a step", async () => {
  await assert.rejects(setup(reply({ steps: [{ title: "a", message: "a", intent: "i", tests: [] }, { title: "b", message: "b", intent: "i", tests: [] }] })).run(), /one commit/);
  await assert.rejects(setup(reply({ steps: [] })).run(), /no steps/);
  await assert.rejects(setup({ nonsense: true }).run(), /not valid/);
});

test("a stack profile may plan several steps", async () => {
  const { store, run } = setup(reply({ steps: [{ title: "a", message: "a", intent: "i", tests: [] }, { title: "b", message: "b", intent: "i", tests: [] }] }));
  assert.equal(store.getArtifact<InvestigationData>((await run({ profile: "gecko" })).investigationId).data.steps.length, 2);
});

test("a diagram of the existing code is verified at the base and flagged where it cannot be", async () => {
  const { store, run } = setup(reply({ diagram: diagram() }));
  const data = store.getArtifact<InvestigationData>((await run()).investigationId).data;
  assert.equal(data.diagram?.kind, "sequence");
  assert.deepEqual(data.diagram?.steps.map((s) => s.verified), [true, false]);
  assert.equal(data.diagramError, undefined);
});

test("a diagram that fails verification is dropped and reported", async () => {
  const { store, run } = setup(reply({ diagram: diagram({ lanes: [] }) }));
  const data = store.getArtifact<InvestigationData>((await run()).investigationId).data;
  assert.equal(data.diagram, undefined);
  assert.match(data.diagramError!, /lanes/);
});

test("spec URLs are resolved through the review plugin's resolver, unresolved ones are kept as unverified", async () => {
  const { store, run } = setup(reply({ specUrls: ["https://html.spec/#a", "https://nope/#b"] }), [], {
    resolve: async (url) => url.includes("html") ? specResult(url) : { found: false, reason: "no such spec" },
  });
  const data = store.getArtifact<InvestigationData>((await run()).investigationId).data;
  assert.deepEqual(data.specRefs?.map((ref) => [ref.url, ref.resolved?.spec ?? null, ref.origin]), [["https://html.spec/#a", "HTML", "llm"], ["https://nope/#b", null, "llm"]]);
});

test("an Investigation renders for chats on it, with sub-refs for locations and steps", async () => {
  const { rt, store, session, run } = setup(reply());
  const { investigationId } = await run();
  const view = { artifacts: store.listArtifacts(session.id), links: [] };
  const { renderRef } = await import("../../../src/runtime/render-ref.ts");
  const full = renderRef(rt.plugins.artifactKinds, view, investigationId);
  for (const text of ["S", "a.txt:2", "Q?", "grep alpha", "found it"]) assert.ok(full.includes(text), text);
  assert.ok(renderRef(rt.plugins.artifactKinds, view, `${investigationId}#loc0`).includes("beta"));
  assert.ok(renderRef(rt.plugins.artifactKinds, view, `${investigationId}#step0`).includes("T"));
  assert.throws(() => renderRef(rt.plugins.artifactKinds, view, `${investigationId}#loc9`), /Unknown ref/);
});

const twoSteps = [{ title: "a", message: "a", intent: "i", tests: [] }, { title: "b", message: "b", intent: "i", tests: [] }];

test("an invalid reply is answered again in the resumed session with only the problems", async () => {
  const { store, run, prompts } = setup((call: number) => call === 0 ? { nonsense: true } : reply());
  const out = await run();
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0]!.resumeProviderSession, undefined);
  assert.equal(prompts[1]!.tools, "read-only");
  assert.equal(prompts[1]!.resumeProviderSession, "p1");
  assert.ok(prompts[1]!.prompt.startsWith("Your answer has problems:") && prompts[1]!.prompt.includes("not valid") && prompts[1]!.prompt.includes("Answer again with the full schema."));
  assert.ok(!prompts[1]!.prompt.includes("# Request"));
  assert.equal(store.getArtifact<InvestigationData>(out.investigationId).data.summary, "S");
});

test("an LLM output error becomes the problem for an attempt that resumes the failed run's session", async () => {
  const { run, prompts } = setup((call: number) => {
    if (call === 0) throw new LlmOutputError("codex returned invalid JSON: nope", "failed-run");
    return reply();
  });
  await run();
  assert.deepEqual(prompts.map((prompt) => prompt.resumeProviderSession), [undefined, "failed-run"]);
  assert.ok(prompts[1]!.prompt.includes("codex returned invalid JSON: nope"));
});

test("an investigation propagates errors other than LLM output errors", async () => {
  const { run } = setup(() => { throw new Error("backend unavailable"); });
  await assert.rejects(run(), /backend unavailable/);
});

test("a reply without steps, then one with too many for a single-commit profile, is retried through the session chain", async () => {
  const { run, prompts } = setup((call: number) => [reply({ steps: [] }), reply({ steps: twoSteps }), reply()][call]);
  await run();
  assert.equal(prompts.length, 3);
  assert.deepEqual(prompts.map((p) => p.resumeProviderSession), [undefined, "p1", "p2"]);
  assert.ok(prompts[1]!.prompt.includes("no steps"));
  assert.ok(prompts[2]!.prompt.includes("takes one commit"));
});

test("the investigation fails with every attempt's problems after two retries", async () => {
  const { run, prompts } = setup(reply({ steps: [] }));
  await assert.rejects(run(), (error: Error) => /still has problems after 2 retries/.test(error.message) && /Attempt 1/.test(error.message) && /Attempt 3/.test(error.message) && /no steps/.test(error.message));
  assert.equal(prompts.length, 3);
});
