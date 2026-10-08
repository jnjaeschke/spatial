import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmPrompt, LlmService } from "../../src/runtime/llm/types.ts";
import type { LlmSelection, SelectorQuestionData, WorkflowStartData } from "../../src/shared/types.ts";
import type { Plugin } from "../../src/runtime/plugins.ts";
import { MAX_SELECTOR_QUESTIONS, selectorSchema } from "../../src/tasks/select-workflow/task.ts";
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
  const rt = new Runtime({ store, plugins: [corePlugin, ...plugins, ...extra], llm, sessionMcp: () => ({ spatial: { type: "stdio", command: "spatial", args: [] } }), repoContext: () => ({ mcpServers: {}, requestableMcpServers: {}, skills: [], instructions: "Repository instructions: inspect carefully." }), git: () => ({}) as GitCapability,
    webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  return { store, rt, session, get call() { return call; } };
}

test("selector prompt lists repo profiles and marks the detected ones", async () => {
  const s = setup({ workflow: "chat", params: {}, title: "T" }, [{ id: "p", repoProfiles: [
    { id: "yes", description: "Detected profile.", commitStyle: "single", detect: async () => true },
    { id: "no", description: "Other profile.", commitStyle: "stack", detect: async () => false },
  ] }]);
  await s.rt.run(s.session.id, "selectWorkflow", { prompt: "do it" });
  const prompt = s.call!.prompt;
  assert.ok(prompt.includes("# Repo profiles"));
  assert.ok(prompt.includes("- yes (detected in this repository): Detected profile."));
  assert.ok(prompt.includes("- no: Other profile."));
});

test("selector stores a validated workflow start and sends workflow schemas", async () => {
  const input = "  Explain X\nwith detail  ";
  const setupResult = setup({ workflow: "chat", params: {}, title: "  Explain X  " });
  const { store, rt, session } = setupResult;
  const { startId } = await rt.run<{ startId: string }>(session.id, "selectWorkflow", { prompt: input });
  const start = store.getArtifact<WorkflowStartData>(startId);
  assert.equal(start.type, "WorkflowStart");
  assert.equal(start.status, "proposed");
  assert.ok(start.provenance.llm);
  assert.deepEqual(start.data, { via: "selector", workflow: "chat", params: {}, title: "Explain X", prompt: input });
  assert.equal(setupResult.call?.tools, "read-only");
  assert.deepEqual(setupResult.call?.mcpServers, { spatial: { type: "stdio", command: "spatial", args: [] } });
  assert.deepEqual(setupResult.call?.schema, selectorSchema(workflows));
  const schema = selectorSchema(workflows) as { properties: { workflow: { enum: string[] }; params: { anyOf: unknown[] } } };
  assert.deepEqual(schema.properties.workflow.enum, ["review", "chat", "implement"]);
  assert.equal(schema.properties.params.anyOf.length, 3);
  assert.ok(!("$schema" in schema));
  for (const text of ["# Workflows", "- review:", "- chat:", "- implement:", "# Request", input]) assert.ok(setupResult.call?.prompt.includes(text), text);
  assert.ok(setupResult.call?.system?.includes("both `base` and `head` to null"));
  assert.ok(setupResult.call?.system?.includes("Repository instructions"));
  assert.ok(setupResult.call?.system?.includes("scm_log"));
});

test("selector stores a question instead of a start when it asks", async () => {
  const setupResult = setup({ question: "  Which branch: feature or fix?  ", workflow: "review", params: { base: null, head: null, revision: null }, title: "Review" });
  const { store, rt, session } = setupResult;
  const out = await rt.run<{ questionId: string }>(session.id, "selectWorkflow", { prompt: "review my branch" });
  assert.deepEqual(store.getArtifact<SelectorQuestionData>(out.questionId).data, { prompt: "review my branch", question: "Which branch: feature or fix?", round: 1 });
  assert.ok(!store.listArtifacts(session.id).some((a) => a.type === "WorkflowStart"));
  assert.ok(!setupResult.call?.prompt.includes("choose now"));
});

test("selector must choose after the last allowed question", async () => {
  const setupResult = setup({ question: "Still unsure?", workflow: "chat", params: {}, title: "x" });
  const { store, rt, session } = setupResult;
  await assert.rejects(rt.run(session.id, "selectWorkflow", { prompt: "x", round: MAX_SELECTOR_QUESTIONS }), /still asks after 2 answers/);
  assert.ok(setupResult.call?.prompt.includes("choose now"));
  assert.equal(store.listArtifacts(session.id).length, 0);
});

test("selector validates review params", async () => {
  const { store, rt, session } = setup({ workflow: "review", params: { base: "main", head: "f", revision: null }, title: "Review" });
  const { startId } = await rt.run<{ startId: string }>(session.id, "selectWorkflow", { prompt: "Review f" });
  assert.deepEqual(store.getArtifact<WorkflowStartData>(startId).data.params, { base: "main", head: "f", revision: null });
});

test("selector accepts a default review range", async () => {
  const { store, rt, session } = setup({ workflow: "review", params: { base: null, head: null, revision: null }, title: "Review" });
  const { startId } = await rt.run<{ startId: string }>(session.id, "selectWorkflow", { prompt: "Review this" });
  assert.deepEqual(store.getArtifact<WorkflowStartData>(startId).data.params, { base: null, head: null, revision: null });
});

test("selector accepts a revision", async () => {
  const { store, rt, session } = setup({ workflow: "review", params: { base: null, head: null, revision: "D123" }, title: "Review" });
  const { startId } = await rt.run<{ startId: string }>(session.id, "selectWorkflow", { prompt: "review D123" });
  assert.deepEqual(store.getArtifact<WorkflowStartData>(startId).data.params, { base: null, head: null, revision: "D123" });
});

for (const [label, json, prompt, error] of [
  ["unknown workflow", { workflow: "deploy", params: {}, title: "x" }, "x", /unknown workflow/],
  ["invalid review params", { workflow: "review", params: { base: "main" }, title: "x" }, "x", /invalid params for review/],
  ["half default review params", { workflow: "review", params: { base: "main", head: null, revision: null }, title: "x" }, "x", /invalid params for review/],
  ["invalid chat params", { workflow: "chat", params: { x: 1 }, title: "x" }, "x", /invalid params for chat/],
  ["blank title", { workflow: "chat", params: {}, title: "  " }, "x", /no title/],
  ["empty prompt", { workflow: "chat", params: {}, title: "x" }, "  ", /Request is empty/],
] as const) {
  test(`selector rejects ${label} without an artifact`, async () => {
    const { store, rt, session } = setup(json);
    await assert.rejects(rt.run(session.id, "selectWorkflow", { prompt }), error);
    assert.equal(store.listArtifacts(session.id, "WorkflowStart").length, 0);
  });
}

test("selector prompt, schema, and workflow descriptions avoid e2e stub needles", () => {
  const needles = ["# Previous narrative", "# Hunks", "# Prior findings", "ROUTE-UPDATE-REVIEW", '"findings"', "THAT IS WRONG", "ENABLE-DEVTOOLS-PLEASE", '"revisions"'];
  const sources = [readFileSync(new URL("../../src/tasks/select-workflow/prompt.md", import.meta.url), "utf8"), JSON.stringify(selectorSchema(workflows)), ...[...workflows.values()].map((workflow) => workflow.description)];
  for (const needle of needles) assert.ok(sources.every((source) => !source.includes(needle)), needle);
});
