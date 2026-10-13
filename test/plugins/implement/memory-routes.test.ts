import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../src/runtime/store.ts";
import { KnowledgeStore } from "../../../src/runtime/knowledge.ts";
import { Runtime, type GitCapability } from "../../../src/runtime/tasks.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import { memoryRoutes } from "../../../src/plugins/implement/server/memory-routes.ts";
import { confirmedKey, memoryKey } from "../../../src/plugins/implement/runtime/memories.ts";
import type { MemoryReactionData, SteerMemory } from "../../../src/plugins/implement/shared/types.ts";
import { routeCall } from "../../helpers/route-call.ts";

const REPO = "/repo/.git";
const memory = (over: Partial<SteerMemory> = {}): SteerMemory => ({ situation: "the agent adds a helper", observed: "It named the helper after its caller", wanted: "Name helpers after what they return", why: null, phases: ["implement"], kinds: [], source: { sessionId: "origin", epoch: 1, steer: "ST" }, ...over });

function setup() {
  const store = new Store(":memory:");
  const knowledge = new KnowledgeStore(":memory:");
  const rt = new Runtime({ store, plugins: [], llm: {} as LlmService, git: () => ({}) as GitCapability, knowledge });
  const session = store.createSession({ worktree: "/repo", repoDir: REPO, title: "t", workflow: "implement" });
  const entry = knowledge.put(REPO, "implement", memoryKey("name-helpers"), memory(), { by: "llm", taskId: "T", sessionId: session.id });
  const notice = store.putArtifact({ sessionId: session.id, type: "MemoryNotice", status: "verified", data: { key: "name-helpers", scope: "repo", entryId: entry.id, memory: memory() }, provenance: { taskId: "T" } });
  const routes = memoryRoutes(rt);
  const list = async () => (await routeCall(routes, "GET", `/api/memories?repo=${encodeURIComponent(REPO)}`)).body as { scope: string; key: string; entryId: string; confirmed: boolean }[];
  return { store, knowledge, session, entry, notice, routes, list };
}

test("memories are listed for an absolute repo path", async () => {
  const { routes, list, entry } = setup();
  assert.deepEqual((await list()).map((view) => [view.scope, view.key, view.entryId, view.confirmed]), [["repo", "name-helpers", entry.id, false]]);
  assert.equal((await routeCall(routes, "GET", "/api/memories?repo=relative")).status, 400);
  assert.equal((await routeCall(routes, "GET", "/api/memories")).status, 400);
});

test("a PUT supersedes a memory, checks its fields and source, and keeps the user's provenance on the memory's session", async () => {
  const { routes, knowledge, list } = setup();
  const put = (body: object) => routeCall(routes, "PUT", "/api/memories", { repo: REPO, scope: "repo", key: "name-helpers", memory: memory(), ...body });
  const ok = await put({ memory: memory({ wanted: "Name helpers after their result" }) });
  assert.equal(ok.status, 201);
  const read = knowledge.get(REPO, "implement", memoryKey("name-helpers"));
  assert.equal(read.state === "current" && read.entry.id, ok.body.entryId);
  assert.deepEqual(read.state === "current" && read.entry.provenance, { by: "user", sessionId: "origin" });
  assert.deepEqual((await list()).map((view) => view.entryId), [ok.body.entryId]);
  assert.equal((await put({ key: "No Spaces" })).status, 400);
  assert.equal((await put({ memory: memory({ phases: [] }) })).status, 400);
  assert.equal((await put({ memory: { ...memory(), source: undefined } })).status, 201);
  assert.equal((await put({ scope: "somewhere" })).status, 400);
  assert.equal((await put({ scope: "global", key: "short-commits", memory: { ...memory(), source: undefined } })).status, 400);
  assert.equal((await put({ scope: "global", key: "short-commits" })).status, 201);
  assert.deepEqual((await list()).map((view) => [view.scope, view.key]), [["repo", "name-helpers"], ["global", "short-commits"]]);
});

test("editing a memory requires the version opened by the form and preserves its source", async () => {
  const { routes, knowledge, entry } = setup();
  const put = (entryId: string, value: SteerMemory) => routeCall(routes, "PUT", "/api/memories", { repo: REPO, scope: "repo", key: "name-helpers", entryId, memory: value });
  const edited = await put(entry.id, memory({ wanted: "Keep the original source", source: { sessionId: "client", epoch: 99, steer: "fake" } }));
  assert.equal(edited.status, 201);
  let read = knowledge.get(REPO, "implement", memoryKey("name-helpers"));
  assert.equal(read.state, "current");
  if (read.state === "current") {
    assert.equal((read.entry.value as SteerMemory).source.sessionId, "origin");
    assert.equal((read.entry.value as SteerMemory).source.steer, "ST");
  }
  assert.equal((await put(entry.id, memory({ wanted: "stale edit" }))).status, 409);
  assert.equal((await put("missing", memory())).status, 409);
  await routeCall(routes, "DELETE", "/api/memories", { repo: REPO, scope: "repo", key: "name-helpers" });
  read = knowledge.get(REPO, "implement", memoryKey("name-helpers"));
  assert.equal(read.state, "deleted");
  const currentId = read.state === "deleted" ? read.entry.id : "";
  assert.equal((await put(currentId, memory())).status, 409);
});

test("moving a memory atomically tombstones its source and refuses stale sources or occupied targets", async () => {
  const moved = setup();
  const response = await routeCall(moved.routes, "POST", "/api/memories/move", { repo: REPO, from: "repo", to: "global", key: "name-helpers", entryId: moved.entry.id });
  assert.equal(response.status, 201);
  assert.equal(moved.knowledge.get(REPO, "implement", memoryKey("name-helpers")).state, "deleted");
  const target = moved.knowledge.get("global", "implement", memoryKey("name-helpers"));
  assert.equal(target.state, "current");
  if (target.state === "current") {
    assert.deepEqual(target.entry.value, moved.entry.value);
    assert.deepEqual(target.entry.provenance, { by: "user", sessionId: "origin" });
  }

  const stale = setup();
  stale.knowledge.put(REPO, "implement", memoryKey("name-helpers"), memory({ wanted: "new version" }), { by: "user", sessionId: "origin" });
  assert.equal((await routeCall(stale.routes, "POST", "/api/memories/move", { repo: REPO, from: "repo", to: "global", key: "name-helpers", entryId: stale.entry.id })).status, 409);
  assert.equal(stale.knowledge.get("global", "implement", memoryKey("name-helpers")).state, "absent");

  const occupied = setup();
  occupied.knowledge.put("global", "implement", memoryKey("name-helpers"), memory(), { by: "user", sessionId: "origin" });
  assert.equal((await routeCall(occupied.routes, "POST", "/api/memories/move", { repo: REPO, from: "repo", to: "global", key: "name-helpers", entryId: occupied.entry.id })).status, 409);
  assert.equal(occupied.knowledge.get(REPO, "implement", memoryKey("name-helpers")).state, "current");
});

test("a DELETE tombstones the current memory and a second one is refused", async () => {
  const { routes, list } = setup();
  const remove = () => routeCall(routes, "DELETE", "/api/memories", { repo: REPO, scope: "repo", key: "name-helpers" });
  assert.equal((await remove()).status, 204);
  assert.deepEqual(await list(), []);
  assert.equal((await remove()).status, 409);
});

test("thumbs up confirms the version the notice was about; thumbs down forgets it; both are recorded in the session", async () => {
  const up = setup();
  const react = (s: ReturnType<typeof setup>, body: object) => routeCall(s.routes, "POST", "/api/memories/react", { sessionId: s.session.id, noticeId: s.notice.id, reaction: "up", ...body });
  const reacted = await react(up, {});
  assert.equal(reacted.status, 201);
  const confirmed = up.knowledge.get(REPO, "implement", confirmedKey("name-helpers"));
  assert.deepEqual(confirmed.state === "current" && confirmed.entry.value, { entryId: up.entry.id });
  assert.equal((await up.list())[0]!.confirmed, true);
  const reaction = up.store.listArtifacts(up.session.id, "MemoryReaction")[0]!;
  assert.deepEqual(reaction.data as MemoryReactionData, { notice: up.notice.id, reaction: "up" });
  assert.equal(reacted.body.artifactId, reaction.id);
  assert.ok(up.store.listLinks(up.session.id).some((link) => link.from === reaction.id && link.to === up.notice.id && link.kind === "about"));

  const down = setup();
  assert.equal((await react(down, { reaction: "down" })).status, 201);
  assert.deepEqual(await down.list(), []);
  assert.equal(down.knowledge.get(REPO, "implement", memoryKey("name-helpers")).state, "deleted");
  assert.equal((await react(down, { reaction: "down" })).status, 409);
});

test("a reaction to a notice whose memory changed since is refused", async () => {
  const s = setup();
  s.knowledge.put(REPO, "implement", memoryKey("name-helpers"), memory({ wanted: "edited" }), { by: "user", sessionId: "origin" });
  const response = await routeCall(s.routes, "POST", "/api/memories/react", { sessionId: s.session.id, noticeId: s.notice.id, reaction: "up" });
  assert.equal(response.status, 409);
  assert.equal(s.store.listArtifacts(s.session.id, "MemoryReaction").length, 0);
});

test("a reaction names a known reaction and a notice of the session", async () => {
  const s = setup();
  const react = (body: object) => routeCall(s.routes, "POST", "/api/memories/react", { sessionId: s.session.id, noticeId: s.notice.id, reaction: "up", ...body });
  assert.equal((await react({ reaction: "sideways" })).status, 400);
  assert.equal((await react({ noticeId: "missing" })).status, 404);
  assert.equal((await react({ sessionId: "missing" })).status, 404);
});
