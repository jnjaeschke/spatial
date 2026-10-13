import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime } from "../../src/runtime/tasks.ts";
import { buildSessionState } from "../../src/runtime/state.ts";
import { definePlugin } from "../../src/plugin-api.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { GitCapability } from "../../src/plugin-api.ts";

test("the snapshot carries plugin session state by plugin id, skips plugins with nothing, and survives a throwing hook", async () => {
  const store = new Store(":memory:");
  const seen: string[] = [];
  const plugins = [
    definePlugin({ id: "has", async sessionState(_rt, session, view) { seen.push(`${session.id}:${view.artifacts.length}`); return { answer: 42 }; } }),
    definePlugin({ id: "nothing", async sessionState() { return undefined; } }),
    definePlugin({ id: "broken", async sessionState() { throw new Error("boom"); } }),
    definePlugin({ id: "plain" }),
  ];
  const rt = new Runtime({ store, plugins, llm: {} as LlmService, git: () => ({}) as GitCapability });
  const session = store.createSession({ worktree: "/r", repoDir: "/r/.git", title: "t" });
  const errors: string[] = [];
  const original = console.error;
  console.error = (message: string) => { errors.push(message); };
  try { var state = await buildSessionState(rt, session.id); } finally { console.error = original; }
  assert.deepEqual(state.plugins, { has: { answer: 42 } });
  assert.deepEqual(seen, [`${session.id}:0`]);
  assert.deepEqual(errors, ["broken session state unavailable: boom"]);
});
