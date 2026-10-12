import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModelsResponse } from "../../src/shared/types.ts";
import { withLastUsed } from "../../src/web/llm-choice.ts";

const models: ModelsResponse = {
  default: { backend: "claude", model: "sonnet", effort: "medium" },
  backends: { claude: { models: [{ id: "sonnet", efforts: ["low", "medium"] }] }, codex: { models: [{ id: "sol", efforts: ["high"] }] } },
};

test("the last-used model becomes the default while the models still offer it", () => {
  const sol = { backend: "codex", model: "sol", effort: "high" } as const;
  assert.deepEqual(withLastUsed(models, JSON.stringify(sol)).default, sol);
  assert.equal(withLastUsed(models, null), models);
  assert.equal(withLastUsed(models, "{broken"), models);
  assert.equal(withLastUsed(models, JSON.stringify({ ...sol, model: "gone" })), models);
  assert.equal(withLastUsed(models, JSON.stringify({ ...sol, effort: "low" })), models);
  assert.equal(withLastUsed({ ...models, backends: { ...models.backends, codex: { error: "not installed" } } }, JSON.stringify(sol)).default, models.default);
});
