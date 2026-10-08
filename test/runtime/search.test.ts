import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime } from "../../src/runtime/tasks.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import { plugins } from "../../src/plugins/index.ts";
import { corePlugin } from "../../src/runtime/create.ts";

const llm = { defaultSelection: { backend: "claude", model: "m", effort: "low" }, async run() { throw new Error("unused"); }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } } as LlmService;
const runtimeOptions = (store: Store) => ({ store, plugins: [corePlugin, ...plugins], llm, git: () => ({} as never), webspec: {} as never, searchfox: {} as never });
const provenance = { taskId: "task" };

test("FTS search scopes to session, filters kinds, and reports syntax errors", () => {
  const store = new Store(":memory:");
  const docs = [
    { ref: "N#c1", kind: "change" as const, body: "SetTextDirectives parser work" },
    { ref: "R", kind: "spec" as const, body: "SetTextDirectives specification" },
  ];
  store.putSearchDocs("s1", "a1", docs);
  store.putSearchDocs("s2", "a2", [{ ref: "N#c2", kind: "change", body: "SetTextDirectives elsewhere" }]);
  const hits = store.search("s1", "SetTextDirectives");
  assert.equal(hits.length, 2);
  assert.ok(hits.every((hit) => hit.snippet.includes("«SetTextDirectives»")));
  assert.ok(hits.every((hit) => !hit.ref.includes("c2")));
  assert.deepEqual(store.search("s1", "SetTextDirectives", { kinds: ["spec"] }).map((hit) => hit.ref), ["R"]);
  assert.throws(() => store.search("s1", "foo("), /Invalid search query/);
  store.close();
});

test("Runtime backfills old artifacts once and search does not duplicate hits", () => {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "session" });
  store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: {
    diffId: "D", summary: "Backfill marker searchable", changes: [],
  }, provenance });
  new Runtime(runtimeOptions(store));
  new Runtime(runtimeOptions(store));
  const hits = store.search(session.id, "Backfill");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "summary");
  store.close();
});
