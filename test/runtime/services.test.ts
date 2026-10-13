import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, defineTask, type GitCapability } from "../../src/runtime/tasks.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";

const probe = defineTask<null, unknown>({ kind: "probe", async run(ctx) { return ctx.services.probe; } });

function runtime(opts: { services?: Record<string, unknown>; built?: (env: Readonly<Record<string, string | undefined>>) => unknown }) {
  const store = new Store(":memory:");
  const rt = new Runtime({ store, plugins: [{ id: "probe", tasks: [probe], services: opts.built }], llm: {} as LlmService, git: () => ({}) as GitCapability, services: opts.services });
  return { rt, session: store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" }) };
}

test("a RuntimeOptions.services override reaches ctx.services and Runtime.services", async () => {
  const service = { name: "override" };
  const { rt, session } = runtime({ services: { probe: service }, built: () => { throw new Error("must not be built"); } });
  assert.equal(await rt.start(session.id, "probe", null).done, service);
  assert.equal(rt.services.probe, service);
});

test("a plugin builds its service from the process environment once", async () => {
  let calls = 0;
  const { rt, session } = runtime({ built: (env) => { calls++; return { env }; } });
  const first = await rt.start(session.id, "probe", null).done as { env: unknown };
  const second = await rt.start(session.id, "probe", null).done;
  assert.equal(first.env, process.env);
  assert.equal(first, second);
  assert.equal(calls, 1);
});

test("an override for an unregistered plugin id is still offered", () => {
  const { rt } = runtime({ services: { other: 1 } });
  assert.equal(rt.services.other, 1);
});
