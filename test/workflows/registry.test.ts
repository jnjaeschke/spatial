import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { parseCommand, workflowInfo } from "../../src/workflows/registry.ts";
import { parseReviewArgs } from "../../src/plugins/review/workflow/review.ts";
import { plugins } from "../../src/plugins/index.ts";
const workflows = Object.fromEntries(plugins.flatMap((plugin) => plugin.workflows ?? []).map((workflow) => [workflow.id, workflow]));
const workflowList = Object.values(workflows);

test("parseReviewArgs accepts revision ids and local ref ranges", () => {
  assert.deepEqual(parseReviewArgs("D292469"), { ok: true, params: { base: null, head: null, revision: "D292469" } });
  assert.deepEqual(parseReviewArgs("https://phabricator.services.mozilla.com/D292469"), { ok: true, params: { base: null, head: null, revision: "https://phabricator.services.mozilla.com/D292469" } });
  assert.deepEqual(parseReviewArgs("main..feature"), { ok: true, params: { base: "main", head: "feature", revision: null } });
  assert.deepEqual(parseReviewArgs(" HEAD~2..HEAD "), { ok: true, params: { base: "HEAD~2", head: "HEAD", revision: null } });
  for (const input of ["a...b", "main", "D12x", "D0", "main..feature extra"]) {
    assert.deepEqual(parseReviewArgs(input), { ok: false, error: "Usage: /review [D-number | base..head]" });
  }
  for (const input of ["", "  "]) assert.deepEqual(parseReviewArgs(input), { ok: true, params: { base: null, head: null, revision: null } });
});

test("workflow parsers validate review and chat arguments", () => {
  const revision = workflows.review.parseArgs("D5");
  assert.deepEqual(revision, { ok: true, params: { base: null, head: null, revision: "D5" } });
  assert.deepEqual(workflows.review.parseArgs("main..feature"), { ok: true, params: { base: "main", head: "feature", revision: null } });
  assert.deepEqual(workflows.review.parseArgs(""), { ok: true, params: { base: null, head: null, revision: null } });
  assert.deepEqual(workflows.chat.parseArgs("  "), { ok: false, error: "Usage: /chat <message>" });
  assert.deepEqual(workflows.chat.parseArgs("hi"), { ok: true, params: {} });
});

test("plugins register their initial phases", () => {
  assert.deepEqual(plugins.flatMap((plugin) => plugin.phases?.map((phase) => phase.id) ?? []), ["review", "chat", "try", "tryPush", "submit", "phabSubmit", "investigate", "implement", "reviewerComments"]);
});

test("parseCommand handles workflow arguments and rejects unknown names", () => {
  assert.deepEqual(parseCommand(workflowList, "/chat  explain this\nplease"), { ok: true, workflow: "chat", params: {}, prompt: "explain this\nplease" });
  assert.deepEqual(parseCommand(workflowList, "/review main..f"), { ok: true, workflow: "review", params: { base: "main", head: "f", revision: null }, prompt: "main..f" });
  assert.deepEqual(parseCommand(workflowList, "/review D5"), { ok: true, workflow: "review", params: { base: null, head: null, revision: "D5" }, prompt: "D5" });
  for (const command of ["/review", "/review   "]) assert.deepEqual(parseCommand(workflowList, command), { ok: true, workflow: "review", params: { base: null, head: null, revision: null }, prompt: "" });
  const unknown = parseCommand(workflowList, "/nope x");
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.match(unknown.error, /Unknown command \/nope; available: \/review, \/chat, \/implement/);
  const constructor = parseCommand(workflowList, "/constructor");
  assert.equal(constructor.ok, false);
  if (!constructor.ok) assert.match(constructor.error, /Unknown command/);
  const slash = parseCommand(workflowList, "/");
  assert.equal(slash.ok, false);
  if (!slash.ok) assert.match(slash.error, /Unknown command/);
  assert.deepEqual(workflowInfo(workflowList).map(({ id }) => id), ["review", "chat", "implement"]);
  assert.ok(workflowInfo(workflowList).every(({ argHint }) => argHint.length > 0));
});

test("workflow parameter schemas are OpenAI-strict objects", () => {
  for (const workflow of Object.values(workflows)) {
    const schema = z.toJSONSchema(workflow.params);
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required ?? [], Object.keys(schema.properties ?? {}));
  }
  const params = workflows.review.params;
  assert.equal(params.safeParse({ base: null, head: null, revision: null }).success, true);
  assert.equal(params.safeParse({ base: "main", head: "f", revision: null }).success, true);
  assert.equal(params.safeParse({ base: null, head: null, revision: "D5" }).success, true);
  assert.equal(params.safeParse({ base: null, head: null, revision: "https://phab.example.com/D5" }).success, true);
  for (const invalid of [
    { base: "main", head: null, revision: null }, { base: null, head: "f", revision: null },
    { base: "main", head: "f", revision: "D5" }, { base: "main", head: null, revision: "D5" },
    { base: null, head: null, revision: "nope" }, { base: null, head: null }, { base: "", head: "", revision: null },
  ]) assert.equal(params.safeParse(invalid).success, false, JSON.stringify(invalid));
  assert.ok(JSON.stringify(z.toJSONSchema(params)).includes("null"));
});
