import { test } from "node:test";
import assert from "node:assert/strict";
import { runStructured, schemaErrors, type JsonSchema } from "../../src/runtime/structured.ts";
import type { LlmPrompt } from "../../src/runtime/llm/types.ts";

const schema: JsonSchema = { type: "object", required: ["name", "count", "kind", "tags"], properties: {
  name: { type: "string" }, count: { type: "integer", minimum: 0 }, kind: { type: "string", enum: ["a", "b"] },
  tags: { type: "array", maxItems: 2, items: { type: "string" } }, note: { type: ["string", "null"] }, pick: { anyOf: [{ type: "null" }, { type: "object", required: ["x"], properties: { x: { type: "number" } } }] },
} };

test("schemaErrors checks types, integers, enums, required, items, bounds and anyOf", () => {
  assert.deepEqual(schemaErrors(schema, { name: "n", count: 2, kind: "a", tags: ["t"], note: null, pick: { x: 1.5 } }), []);
  assert.deepEqual(schemaErrors(schema, { name: 1, count: 1.5, kind: "c", tags: ["t", 2, "u"], pick: { y: 1 } }), [
    "$.name must be string, got integer",
    "$.count must be integer, got number",
    "$.kind must be one of \"a\", \"b\"",
    "$.tags must have at most 2 items",
    "$.tags[1] must be string, got integer",
    "$.pick matches none of the allowed shapes",
  ]);
  assert.deepEqual(schemaErrors(schema, { count: -1, kind: "a", tags: [] }), ["$.name is missing", "$.count must be at least 0"]);
  assert.deepEqual(schemaErrors(schema, undefined), ["$ must be object, got undefined"]);
});

const llm = (replies: unknown[]) => {
  const prompts: LlmPrompt[] = [];
  return { prompts, run: async (prompt: LlmPrompt) => { prompts.push(prompt); return { text: "", json: replies[prompts.length - 1], providerSessionId: "p", selection: { backend: "claude" as const, model: "m", effort: "low" } }; } };
};
const small: JsonSchema = { type: "object", required: ["n"], properties: { n: { type: "integer" } } };

test("runStructured returns a valid reply without repairs", async () => {
  const fake = llm([{ n: 1 }]);
  const { json } = await runStructured<{ n: number }>(fake, { prompt: "p", tools: "none", schema: small, label: "Thing" });
  assert.deepEqual(json, { n: 1 });
  assert.equal(fake.prompts.length, 1);
});

test("runStructured re-prompts with the errors and the previous answer, and validates per attempt", async () => {
  const fake = llm([{ n: "x" }, { n: 3 }, { n: 4 }]);
  const repaired: string[][] = [];
  const attempts: number[] = [];
  const { json } = await runStructured<{ n: number }>(fake, { prompt: "p", tools: "none", schema: small, label: "Thing", repairs: 2, onRepair: (errors) => repaired.push(errors), validate: (value, attempt) => { attempts.push(attempt); return (value as { n: number }).n === 3 ? ["n must not be 3"] : []; } });
  assert.deepEqual(json, { n: 4 });
  assert.deepEqual(repaired, [["$.n must be integer, got string"], ["n must not be 3"]]);
  assert.deepEqual(attempts, [1, 2]);
  assert.match(fake.prompts[1]!.prompt, /^p\n\nYour previous answer was invalid:\n- \$\.n must be integer, got string\n\nPrevious answer:\n\{"n":"x"\}\n\nReturn a corrected, complete answer\.$/);
});

test("runStructured throws with the label after the last repair", async () => {
  const fake = llm([{ n: "x" }, { n: "y" }]);
  await assert.rejects(runStructured(fake, { prompt: "p", tools: "none", schema: small, label: "Thing", repairs: 1 }), { message: "Thing failed validation:\n$.n must be integer, got string" });
  await assert.rejects(runStructured(llm([{}]), { prompt: "p", tools: "none", schema: small, label: "Other" }), /Other failed validation:\n\$\.n is missing/);
});
