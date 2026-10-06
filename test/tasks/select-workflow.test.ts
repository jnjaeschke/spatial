import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmPrompt, LlmService } from "../../src/runtime/llm/types.ts";
import type { LlmSelection, WorkflowStartData } from "../../src/shared/types.ts";
import { workflows } from "../../src/workflows/registry.ts";
import { selectWorkflow, selectorSchema } from "../../src/tasks/select-workflow/task.ts";

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };

function setup(json: unknown) {
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
  const rt = new Runtime({ store, tasks: [selectWorkflow], llm, git: () => ({}) as GitCapability,
    webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  return { store, rt, session, get call() { return call; } };
}

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
  assert.equal(setupResult.call?.tools, "none");
  assert.deepEqual(setupResult.call?.schema, selectorSchema());
  const schema = selectorSchema() as { properties: { workflow: { enum: string[] }; params: { anyOf: unknown[] } } };
  assert.deepEqual(schema.properties.workflow.enum, ["review", "chat"]);
  assert.equal(schema.properties.params.anyOf.length, 2);
  assert.ok(!("$schema" in schema));
  for (const text of ["# Workflows", "- review:", "- chat:", "# Request", input]) assert.ok(setupResult.call?.prompt.includes(text), text);
});

test("selector validates review params", async () => {
  const { store, rt, session } = setup({ workflow: "review", params: { base: "main", head: "f" }, title: "Review" });
  const { startId } = await rt.run<{ startId: string }>(session.id, "selectWorkflow", { prompt: "Review f" });
  assert.deepEqual(store.getArtifact<WorkflowStartData>(startId).data.params, { base: "main", head: "f" });
});

for (const [label, json, prompt, error] of [
  ["unknown workflow", { workflow: "deploy", params: {}, title: "x" }, "x", /unknown workflow/],
  ["invalid review params", { workflow: "review", params: { base: "main" }, title: "x" }, "x", /invalid params for review/],
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
  const sources = [readFileSync(new URL("../../src/tasks/select-workflow/prompt.md", import.meta.url), "utf8"), JSON.stringify(selectorSchema()), ...Object.values(workflows).map((workflow) => workflow.description)];
  for (const needle of needles) assert.ok(sources.every((source) => !source.includes(needle)), needle);
});
