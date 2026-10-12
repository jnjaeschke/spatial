import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmPrompt, LlmService } from "../../src/runtime/llm/types.ts";
import type { LlmSelection } from "../../src/shared/types.ts";
import type { Plugin } from "../../src/runtime/plugins.ts";
import { MAX_SELECTOR_QUESTIONS, selectWorkflow, selectorSchema } from "../../src/workflows/select.ts";
import { corePlugin } from "../../src/runtime/create.ts";
import { plugins } from "../../src/plugins/index.ts";

const workflows = new Map(plugins.flatMap((plugin) => plugin.workflows ?? []).map((workflow) => [workflow.id, workflow]));

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };

function setup(json: unknown, extra: Plugin[] = []) {
  const store = new Store(":memory:");
  let call: LlmPrompt | undefined;
  const llm: LlmService = {
    defaultSelection: selection,
    async run(_selection, prompt) {
      call = prompt;
      return { text: "selected", json, providerSessionId: "p", selection };
    },
    async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
  };
  const rt = new Runtime({ store, plugins: [corePlugin, ...plugins, ...extra], llm, repoMcp: (repo) => ({ spatial: { type: "stdio", command: "spatial", args: ["--repo", repo] } }), repoContext: () => ({ mcpServers: {}, requestableMcpServers: {}, skills: [], instructions: "Repository instructions: inspect carefully." }), git: () => ({}) as GitCapability,
    webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const select = (prompt: string, round = 0) => selectWorkflow(rt, "/repo", prompt, round, undefined, new AbortController().signal);
  return { store, select, get call() { return call; } };
}

test("selector prompt lists repo profiles and marks the detected ones", async () => {
  const s = setup({ workflow: "chat", params: {}, title: "T" }, [{ id: "p", repoProfiles: [
    { id: "yes", description: "Detected profile.", commitStyle: "single", detect: async () => true },
    { id: "no", description: "Other profile.", commitStyle: "stack", detect: async () => false },
  ] }]);
  await s.select("do it");
  const prompt = s.call!.prompt;
  assert.ok(prompt.includes("# Repo profiles"));
  assert.ok(prompt.includes("- yes (detected in this repository): Detected profile."));
  assert.ok(prompt.includes("- no: Other profile."));
});

test("selector returns a validated choice and sends workflow schemas and the repo MCP server", async () => {
  const input = "  Explain X\nwith detail  ";
  const setupResult = setup({ workflow: "chat", params: {}, title: "  Explain X  " });
  assert.deepEqual(await setupResult.select(input), { workflow: "chat", params: {}, title: "Explain X", selection });
  assert.equal(setupResult.call?.tools, "read-only");
  assert.equal(setupResult.call?.cwd, "/repo");
  assert.deepEqual(setupResult.call?.mcpServers, { spatial: { type: "stdio", command: "spatial", args: ["--repo", "/repo"] } });
  assert.deepEqual(setupResult.call?.schema, selectorSchema(workflows));
  const schema = selectorSchema(workflows) as { properties: { workflow: { enum: string[] }; params: { anyOf: unknown[] } } };
  assert.deepEqual(schema.properties.workflow.enum, ["review", "chat", "implement", "explore"]);
  assert.equal(schema.properties.params.anyOf.length, 4);
  assert.ok(!("$schema" in schema));
  for (const text of ["# Workflows", "- review:", "- chat:", "- implement:", "- explore:", "# Request", input]) assert.ok(setupResult.call?.prompt.includes(text), text);
  assert.ok(setupResult.call?.system?.includes("both `base` and `head` to null"));
  assert.ok(setupResult.call?.system?.includes("Repository instructions"));
  assert.ok(setupResult.call?.system?.includes("scm_log"));
});

test("selector returns a question instead of a choice when it asks", async () => {
  const setupResult = setup({ question: "  Which branch: feature or fix?  ", workflow: "review", params: { base: null, head: null, revision: null }, title: "Review" });
  assert.deepEqual(await setupResult.select("review my branch"), { question: "Which branch: feature or fix?" });
  assert.ok(!setupResult.call?.prompt.includes("choose now"));
});

test("selector must choose after the last allowed question", async () => {
  const setupResult = setup({ question: "Still unsure?", workflow: "chat", params: {}, title: "x" });
  await assert.rejects(setupResult.select("x", MAX_SELECTOR_QUESTIONS), /still asks after 2 answers/);
  assert.ok(setupResult.call?.prompt.includes("choose now"));
});

test("selector validates review params", async () => {
  const { select } = setup({ workflow: "review", params: { base: "main", head: "f", revision: null }, title: "Review" });
  assert.deepEqual(((await select("Review f")) as { params: unknown }).params, { base: "main", head: "f", revision: null });
});

test("selector accepts a default review range", async () => {
  const { select } = setup({ workflow: "review", params: { base: null, head: null, revision: null }, title: "Review" });
  assert.deepEqual(((await select("Review this")) as { params: unknown }).params, { base: null, head: null, revision: null });
});

test("selector accepts a revision", async () => {
  const { select } = setup({ workflow: "review", params: { base: null, head: null, revision: "D123" }, title: "Review" });
  assert.deepEqual(((await select("review D123")) as { params: unknown }).params, { base: null, head: null, revision: "D123" });
});

for (const [label, json, prompt, error] of [
  ["unknown workflow", { workflow: "deploy", params: {}, title: "x" }, "x", /unknown workflow/],
  ["invalid review params", { workflow: "review", params: { base: "main" }, title: "x" }, "x", /invalid params for review/],
  ["half default review params", { workflow: "review", params: { base: "main", head: null, revision: null }, title: "x" }, "x", /invalid params for review/],
  ["invalid chat params", { workflow: "chat", params: { x: 1 }, title: "x" }, "x", /invalid params for chat/],
  ["blank title", { workflow: "chat", params: {}, title: "  " }, "x", /no title/],
  ["empty prompt", { workflow: "chat", params: {}, title: "x" }, "  ", /Request is empty/],
] as const) {
  test(`selector rejects ${label}`, async () => {
    await assert.rejects(setup(json).select(prompt), error);
  });
}

test("selector prompt, schema, and workflow descriptions avoid e2e stub needles", () => {
  const needles = ["# Previous narrative", "# Hunks", "# Prior findings", "ROUTE-UPDATE-REVIEW", '"findings"', "THAT IS WRONG", "ENABLE-DEVTOOLS-PLEASE", '"revisions"'];
  const sources = [readFileSync(new URL("../../src/workflows/select-prompt.md", import.meta.url), "utf8"), JSON.stringify(selectorSchema(workflows)), ...[...workflows.values()].map((workflow) => workflow.description)];
  for (const needle of needles) assert.ok(sources.every((source) => !source.includes(needle)), needle);
});
