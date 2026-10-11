import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { SpecReferenceData } from "../../src/plugins/spec/api.ts";
import { lookupSpecRef } from "../../src/plugins/review/tasks/lookup-spec-ref/task.ts";

function setup(found: boolean) {
  const store = new Store(":memory:");
  const webspec: WebspecCapability = { effect: "read-only", async analyze() { return []; }, async resolve() { return found
    ? { found: true, spec: { spec: "HTML", anchor: "setup", title: "The setup", type: "section", url: "https://html.spec.whatwg.org/#setup", content: "A setup." } }
    : { found: false, reason: "no such section" };
  } };
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [lookupSpecRef] }], llm: {} as LlmService, git: () => ({}) as never, webspec, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  return { store, rt, session };
}

test("lookupSpecRef stores a resolved link reference", async () => {
  const { store, rt, session } = setup(true);
  const { specId } = await rt.run<{ specId: string }>(session.id, "lookupSpecRef", { ref: "HTML#setup" });
  const spec = store.getArtifact<SpecReferenceData>(specId);
  assert.equal(spec.status, "verified");
  assert.equal(spec.data.origin, "link");
  assert.equal(spec.data.resolved?.anchor, "setup");
  assert.deepEqual(store.listLinks(session.id), []);
});

test("lookupSpecRef records why an unresolved link reference was not found", async () => {
  const { store, rt, session } = setup(false);
  const { specId } = await rt.run<{ specId: string }>(session.id, "lookupSpecRef", { ref: "HTML#missing" });
  const spec = store.getArtifact<SpecReferenceData>(specId);
  assert.equal(spec.status, "proposed");
  assert.equal(spec.data.origin, "link");
  assert.equal(spec.data.resolved, null);
  assert.equal(spec.data.reason, "no such section");
});
