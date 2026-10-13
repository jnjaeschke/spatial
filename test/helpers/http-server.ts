import { after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/runtime/store.ts";
import { Runtime } from "../../src/runtime/tasks.ts";
import { definePlugin } from "../../src/plugin-api.ts";
import type { ChatReplyField } from "../../src/runtime/plugins.ts";
import { makeGit } from "../../src/runtime/git/read.ts";
import { corePlugin } from "../../src/runtime/create.ts";
import { plugins } from "../../src/plugins/index.ts";
export { waitFor } from "./wait-for.ts";
import { createHttpServer } from "../../src/server/http.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { Session } from "../../src/shared/types.ts";
import { loadRepoContext } from "../../src/runtime/repo-context.ts";
import { makeRepo } from "./git-fixture.ts";

export const NARRATIVE = { summary: "S", changes: [{ id: "c1", title: "t", explanation: "e", rationale: "r", hunkIds: ["f0h0", "f1h0"], dependsOn: [], specUrls: [] }] };
export const state = { failNarrationOnce: false, requestPhase: false, unblockPhase: undefined as (() => void) | undefined };
export const CHAT_REPLY = { answer: "hi", questions: [], revisions: [], requestMcpServers: [], diagram: null, tryPush: null, phabSubmit: null, specExplore: null };
export const replyFor = (prompt: { schema?: object }) => prompt.schema && "properties" in prompt.schema && "answer" in (prompt.schema as { properties: object }).properties;
const selectorFor = (prompt: { schema?: object }) => prompt.schema && "properties" in prompt.schema && "workflow" in (prompt.schema as { properties: object }).properties;
export const reviewFor = (prompt: { schema?: object; system?: string }) => prompt.system?.includes("You review a code patch") || !!prompt.schema && "properties" in prompt.schema && "findings" in (prompt.schema as { properties: object }).properties;
const commentFor = (prompt: { schema?: object }) => !!prompt.schema && "properties" in prompt.schema && "body" in (prompt.schema as { properties: object }).properties;
export const llm: LlmService = {
  defaultSelection: { backend: "claude", model: "sonnet", effort: "medium" },
  async run(selection, prompt) { if (state.failNarrationOnce && prompt.system?.startsWith("You explain a code patch")) { state.failNarrationOnce = false; throw new Error("synthetic narration failure"); } const selector = selectorFor(prompt); const chat = replyFor(prompt); const review = reviewFor(prompt); const comment = commentFor(prompt); const stack = prompt.schema && "properties" in prompt.schema && "commitIntents" in (prompt.schema as { properties: object }).properties; const commitHunks = [...prompt.prompt.matchAll(/^### (f\d+h\d+) .* \[C(\d+)\](?: \[[^\]]+\])*$/gm)].map((match) => [match[1]!, Number(match[2])]); return { text: "hi", json: prompt.schema ? selector ? { workflow: "chat", params: {}, title: "Picked" } : chat ? { ...CHAT_REPLY, requestPhase: state.requestPhase ? {} : null } : review ? { findings: [], verdicts: [] } : comment ? { body: "Generated review comment." } : stack ? { summary: "Adds `c.txt`, then updates `a.txt`.", commitIntents: Array.from({ length: (prompt.prompt.match(/^## C\d+: /gm) ?? []).length }, (_, i) => `Commit ${i + 1} intent.`), flowHints: Array.from({ length: (prompt.prompt.match(/^## C\d+: /gm) ?? []).length }, () => null), changes: [...new Set(commitHunks.map(([, commit]) => commit))].sort().map((commit, index, owners) => ({ id: `c${commit}`, title: `Commit ${commit}`, explanation: `Changes of commit ${commit}.`, rationale: "r", hunkIds: commitHunks.filter(([, owner]) => owner === commit).map(([id]) => id), dependsOn: index ? [`c${owners[index - 1]}`] : [], specUrls: [] })) } : NARRATIVE : undefined, providerSessionId: "p", selection: selection ?? this.defaultSelection }; },
  async listModels() { return { claude: { models: [{ id: "sonnet", efforts: ["low"] }] }, codex: { error: "no cache" } }; },
};
export const repo = makeRepo();
repo.commit({ "a.txt": "1\n2\n" }, "base");
repo.commit({ "a.txt": "1\nTWO\n", "c.txt": "c\n" }, "change");
export const staticDir = mkdtempSync(join(tmpdir(), "static-"));
writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>app</title>");
const runRequestField: ChatReplyField = { name: "requestPhase", label: "Run", schema: { type: "object" }, prompt: "", async accept() { return { ok: true, artifacts: [], run: { phase: "p", input: { x: 1 } } }; } };
const task6Plugin = definePlugin({ id: "http-task6-test", chatReplyFields: [runRequestField], phases: [
  { id: "p", async run() {} },
  { id: "blocking", async run() { await new Promise<void>((resolve) => { state.unblockPhase = resolve; }); } },
] });
export const rt = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, ...plugins, task6Plugin], llm, git: makeGit, repoContext: (repo) => loadRepoContext(repo) });
export const server = createHttpServer(rt, { staticDir });
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
export const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

export const post = (path: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
export const put = (path: string, body: unknown) => fetch(base + path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export async function newSession(): Promise<Session> {
  const res = await post("/api/sessions", { repo: repo.dir, title: "t" });
  assert.equal(res.status, 201);
  return res.json();
}
