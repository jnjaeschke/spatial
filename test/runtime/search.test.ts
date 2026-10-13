import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { plugins } from "../../src/plugins/index.ts";
import { corePlugin } from "../../src/runtime/create.ts";
import { testRuntime } from "../helpers/runtime.ts";

const runtime = (store: Store) => testRuntime({ store, plugins: [corePlugin, ...plugins] }).rt;
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
  runtime(store);
  runtime(store);
  const hits = store.search(session.id, "Backfill");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "summary");
  store.close();
});

test("Runtime artifact and revising-link writes index and emit once", () => {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "session" });
  const rt = runtime(store);
  const events: { actor: string; type: string; payload: unknown }[] = [];
  rt.onEvent((event) => events.push(event));

  const previous = rt.putArtifact("runtime", { sessionId: session.id, type: "PhabComment", status: "verified", data: { phid: "PHID-COMMENT", version: 1, author: "Ada", bot: false, byMe: false, body: "old searchable phrase", own: false, done: false, txId: 1, dateCreated: 1 }, provenance });
  const next = rt.putArtifact("runtime", { sessionId: session.id, type: "PhabComment", status: "verified", data: { phid: "PHID-COMMENT", version: 2, author: "Ada", bot: false, byMe: false, body: "new searchable phrase", own: false, done: false, txId: 2, dateCreated: 2 }, provenance });
  assert.equal(store.search(session.id, "old").length, 1);
  rt.putLink("runtime", { sessionId: session.id, from: next.id, to: previous.id, kind: "revises" });

  assert.equal(store.search(session.id, "old").length, 0);
  assert.equal(store.search(session.id, "new").length, 1);
  assert.deepEqual(events.map(({ actor, type, payload }) => ({ actor, type, payload })), [
    { actor: "runtime", type: "artifact.created", payload: { artifactId: previous.id, type: "PhabComment" } },
    { actor: "runtime", type: "artifact.created", payload: { artifactId: next.id, type: "PhabComment" } },
    { actor: "runtime", type: "link.created", payload: { linkId: store.listLinks(session.id)[0]!.id, from: next.id, to: previous.id, kind: "revises" } },
  ]);
  store.close();
});
