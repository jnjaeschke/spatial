import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { parseCommand, parseReviewArgs, workflowInfo, workflows } from "../../src/workflows/registry.ts";

test("parseReviewArgs accepts revision ids and local ref ranges", () => {
  assert.deepEqual(parseReviewArgs("D292469"), { ok: true, params: { revision: { host: null, id: 292469 } } });
  assert.deepEqual(parseReviewArgs("https://phabricator.services.mozilla.com/D292469"), {
    ok: true, params: { revision: { host: "https://phabricator.services.mozilla.com", id: 292469 } },
  });
  assert.deepEqual(parseReviewArgs("main..feature"), { ok: true, params: { base: "main", head: "feature" } });
  assert.deepEqual(parseReviewArgs(" HEAD~2..HEAD "), { ok: true, params: { base: "HEAD~2", head: "HEAD" } });
  for (const input of ["a...b", "main", "D12x", "main..feature extra"]) {
    assert.deepEqual(parseReviewArgs(input), { ok: false, error: "Usage: /review [D-number | base..head]" });
  }
  for (const input of ["", "  "]) assert.deepEqual(parseReviewArgs(input), { ok: true, params: { base: null, head: null } });
});

test("workflow parsers validate review and chat arguments", () => {
  const revision = workflows.review.parseArgs("D5");
  assert.equal(revision.ok, false);
  if (!revision.ok) assert.match(revision.error, /not available yet/);
  assert.deepEqual(workflows.review.parseArgs("main..feature"), { ok: true, params: { base: "main", head: "feature" } });
  assert.deepEqual(workflows.review.parseArgs(""), { ok: true, params: { base: null, head: null } });
  assert.deepEqual(workflows.chat.parseArgs("  "), { ok: false, error: "Usage: /chat <message>" });
  assert.deepEqual(workflows.chat.parseArgs("hi"), { ok: true, params: {} });
});

test("parseCommand handles workflow arguments and rejects unknown names", () => {
  assert.deepEqual(parseCommand("/chat  explain this\nplease"), { ok: true, workflow: "chat", params: {}, prompt: "explain this\nplease" });
  assert.deepEqual(parseCommand("/review main..f"), { ok: true, workflow: "review", params: { base: "main", head: "f" }, prompt: "main..f" });
  for (const command of ["/review", "/review   "]) assert.deepEqual(parseCommand(command), { ok: true, workflow: "review", params: { base: null, head: null }, prompt: "" });
  const unknown = parseCommand("/nope x");
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.match(unknown.error, /Unknown command \/nope; available: \/review, \/chat/);
  const constructor = parseCommand("/constructor");
  assert.equal(constructor.ok, false);
  if (!constructor.ok) assert.match(constructor.error, /Unknown command/);
  const slash = parseCommand("/");
  assert.equal(slash.ok, false);
  if (!slash.ok) assert.match(slash.error, /Unknown command/);
  assert.deepEqual(workflowInfo().map(({ id }) => id), ["review", "chat"]);
  assert.ok(workflowInfo().every(({ argHint }) => argHint.length > 0));
});

test("workflow parameter schemas are OpenAI-strict objects", () => {
  for (const workflow of Object.values(workflows)) {
    const schema = z.toJSONSchema(workflow.params);
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required ?? [], Object.keys(schema.properties ?? {}));
  }
  const params = workflows.review.params;
  assert.equal(params.safeParse({ base: null, head: null }).success, true);
  assert.equal(params.safeParse({ base: "main", head: "f" }).success, true);
  assert.equal(params.safeParse({ base: "main", head: null }).success, false);
  assert.equal(params.safeParse({ base: null, head: "f" }).success, false);
  assert.equal(params.safeParse({ base: "", head: "" }).success, false);
  assert.ok(JSON.stringify(z.toJSONSchema(params)).includes("null"));
});
