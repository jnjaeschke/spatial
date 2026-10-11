import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, type GitCapability } from "../../../src/runtime/tasks.ts";
import { KnowledgeStore } from "../../../src/runtime/knowledge.ts";
import type { CodeSearch } from "../../../src/runtime/code-search.ts";
import type { LlmPrompt, LlmService } from "../../../src/runtime/llm/types.ts";
import type { LlmSelection } from "../../../src/shared/types.ts";
import { corePlugin } from "../../../src/runtime/create.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { makeWebspec } from "../../../src/runtime/webspec.ts";
import { verifyCandidate } from "../../../src/plugins/spec/runtime/engine-map.ts";
import type { FoundImplementation } from "../../../src/plugins/spec/tasks/find-implementation/task.ts";
import type { EngineSite, SpecAlgorithmData } from "../../../src/plugins/spec/shared/types.ts";
import { CANDIDATE, INTERNAL_LOAD, NAVIGATE, NAVIGATE_SITE, mapping, searchfox } from "./gecko-fakes.ts";

const signal = new AbortController().signal;
const A_CPP = ["// A", "void A::Abort() {", "  if (!mDoc) return;", "  mDoc->Abort();", "}"].join("\n");
const code: Pick<CodeSearch, "file" | "functionAt"> = {
  async file(path) { return path === "dom/A.cpp" ? A_CPP : path === "dom/A.h" ? "class A {\n  void Abort();\n};" : null; },
  async functionAt(path, line) { return path === "dom/A.cpp" && line >= 2 && line <= 5 ? [{ symbol: "_ZN1A5AbortEv", signature: "void A::Abort() {" }] : []; },
};

test("a candidate passes when its line reads the quote; the site is the function there, or a declaration outside functions", async () => {
  assert.deepEqual(await verifyCandidate(code, { path: "dom/A.cpp", line: 4, quote: "mDoc->Abort();", why: "Aborts." }, signal), { ok: true, site: { path: "dom/A.cpp", line: 2, symbol: "_ZN1A5AbortEv", signature: "void A::Abort() {", quote: "void A::Abort() {", method: "llm", refs: [], steps: [], why: "Aborts." } });
  assert.deepEqual(await verifyCandidate(code, { path: "dom/A.h", line: 2, quote: "void Abort();", why: "Declared." }, signal), { ok: true, site: { path: "dom/A.h", line: 2, symbol: "", signature: "void Abort();", quote: "void Abort();", method: "llm", refs: [], steps: [], why: "Declared." } });
});

test("a candidate fails with an empty quote, a quote not at its line, a missing file or a line past the end", async () => {
  const check = (path: string, line: number, quote: string) => verifyCandidate(code, { path, line, quote, why: "" }, signal);
  assert.deepEqual(await check("dom/A.cpp", 2, "  "), { ok: false, reason: "the quote is empty" });
  assert.deepEqual(await check("dom/A.cpp", 3, "mDoc->Abort();"), { ok: false, reason: "dom/A.cpp:3 does not read `mDoc->Abort();`" });
  assert.deepEqual(await check("dom/Gone.cpp", 1, "x"), { ok: false, reason: "dom/Gone.cpp does not exist" });
  assert.deepEqual(await check("dom/A.cpp", 50, "x"), { ok: false, reason: "dom/A.cpp has no line 50" });
});

function setup(candidates: unknown[], skill: boolean) {
  const repo = mkdtempSync(join(tmpdir(), "gecko-"));
  if (skill) { mkdirSync(join(repo, ".agents", "skills", "specmap"), { recursive: true }); writeFileSync(join(repo, ".agents", "skills", "specmap", "SKILL.md"), "---\nname: specmap\ndescription: Map specs to code.\n---\n\nSPECMAP-SKILL-BODY\n"); }
  const prompts: LlmPrompt[] = [];
  const DEFAULT: LlmSelection = { backend: "claude", model: "sonnet", effort: "low" };
  const llm = { defaultSelection: DEFAULT, async run(selection: LlmSelection | undefined, prompt: LlmPrompt) { prompts.push(prompt); return { text: "", json: { candidates }, providerSessionId: "p", selection: selection ?? DEFAULT }; }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } } as LlmService;
  const fake = makeWebspec({ bin: fileURLToPath(new URL("../../stubs/fake-webspec.mjs", import.meta.url)) });
  const webspec = { ...fake, async query(ref: string) { const anchor = ref.split("#")[1]!; return { found: true as const, section: { spec: "HTML", anchor, title: anchor, type: "algorithm", url: `https://html.spec.whatwg.org/#${anchor}`, content: "1. Edit the line.\n2. Add the file.", outgoingRefs: 0, effects: [], effectsStatus: { state: "ready" as const, semantics: "may" as const, issues: [], omitted: 0 }, sha: `fake-${anchor}` } }; }, async effectPaths() { return { effects: [], explanations: [] }; }, refs: async () => ({ incoming: ["HTML#navigate"], outgoing: ["HTML#unmapped"] }) };
  const knowledge = new KnowledgeStore(":memory:");
  const rt = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, specPlugin], llm, git: () => ({}) as GitCapability, webspec, searchfox, knowledge, repoContext: () => ({ mcpServers: {}, requestableMcpServers: {}, skills: skill ? [{ name: "specmap", description: "Map specs to code." }] : [], instructions: null }) });
  const session = rt.store.createSession({ worktree: repo, repoDir: join(repo, ".git"), title: "t" });
  return { rt, session, prompts, knowledge };
}
async function algorithm(rt: Runtime, sessionId: string) {
  const { algorithmId } = await rt.run<{ algorithmId: string }>(sessionId, "loadSpecAlgorithm", { ref: "HTML#navigate" });
  return rt.store.getArtifact<SpecAlgorithmData>(algorithmId);
}

test("findImplementation proposes only verified, new, unrejected candidates, from the steps, seeds, rejections and the specmap skill", async () => {
  const { rt, session, prompts, knowledge } = setup([CANDIDATE, { path: "docshell/base/BrowsingContext.cpp", line: 2649, quote: NAVIGATE.signature, why: "Not there." }, { path: "docshell/base/nsDocShell.cpp", line: 8400, quote: INTERNAL_LOAD.signature, why: "Rejected before." }, { path: "dom/Fourth.cpp", line: 1, quote: "void Fourth::One() {", why: "Past the limit." }], true);
  const by = { by: "plugin" as const, sessionId: session.id };
  knowledge.put("global", "spec", "impl|gecko|HTML#navigate", mapping([{ ...NAVIGATE_SITE, path: "docshell/base/nsDocShell.cpp", line: 8400, symbol: INTERNAL_LOAD.symbol, signature: INTERNAL_LOAD.signature, method: "spec-link" }, { ...NAVIGATE_SITE, path: "dom/Proposed.cpp", signature: "void Proposed::Only(" }], [{ path: "docshell/base/nsDocShell.cpp", line: 8400, symbol: INTERNAL_LOAD.symbol, signature: INTERNAL_LOAD.signature }]), by);
  const a = await algorithm(rt, session.id);
  const out = await rt.run<FoundImplementation>(session.id, "findImplementation", { algorithmId: a.id, engine: "gecko", stale: null });
  assert.deepEqual(out.sites, [NAVIGATE_SITE]);
  assert.deepEqual(out.dropped.map((d) => d.reason), ["docshell/base/BrowsingContext.cpp:2649 does not read `void BrowsingContext::Navigate(`", "already known or rejected"]);
  const [prompt] = prompts;
  assert.equal(prompt!.tools, "read-only");
  assert.match(prompt!.system!, /SPECMAP-SKILL-BODY[\s\S]*You find where Gecko \(mozilla-central\) implements/);
  assert.match(prompt!.prompt, /\[1\] Edit the line\.\n\[2\] Add the file\./);
  assert.match(prompt!.prompt, /- HTML#navigate \(calls this\): `nsDocShell::InternalLoad` at docshell\/base\/nsDocShell\.cpp:8400/);
  assert.ok(!prompt!.prompt.includes("Proposed::Only"), "unconfirmed proposals are not seeds");
  assert.match(prompt!.prompt, /## Rejected by the user[\s\S]*docshell\/base\/nsDocShell\.cpp `nsresult nsDocShell::InternalLoad/);
});

test("without the specmap skill the task brings its own commands; Find again describes the stale site", async () => {
  const { rt, session, prompts, knowledge } = setup([], false);
  knowledge.put("global", "spec", "impl|gecko|HTML#navigate", mapping([]), { by: "plugin", sessionId: session.id });
  const stale: EngineSite = { ...NAVIGATE_SITE, path: "docshell/base/Old.cpp", line: 12, quote: "void Old::Navigate() {", signature: "void Old::Navigate() {", stale: true };
  const out = await rt.run<FoundImplementation>(session.id, "findImplementation", { algorithmId: (await algorithm(rt, session.id)).id, engine: "gecko", stale });
  assert.deepEqual(out, { sites: [], dropped: [] });
  assert.match(prompts[0]!.system!, /^Useful commands:/);
  assert.match(prompts[0]!.prompt, /## Moved\n[^\n]*docshell\/base\/Old\.cpp:12 `void Old::Navigate\(\) \{`, quote `void Old::Navigate\(\) \{`/);
});
