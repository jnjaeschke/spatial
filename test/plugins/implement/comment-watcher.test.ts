import { test } from "node:test";
import assert from "node:assert/strict";
import { newReviewerComments } from "../../../src/plugins/implement/runtime/comment-watcher.ts";
import { CommentWatcher } from "../../../src/plugins/implement/runtime/comment-watcher.ts";
import type { Artifact, Epoch, Runtime } from "../../../src/plugin-api.ts";

const artifact = (phid: string, over: object = {}): Artifact => ({ id: phid, sessionId: "s", type: "PhabComment", status: "verified", data: { phid, byMe: false, done: false, version: 1, ...over }, provenance: { taskId: "test" }, epoch: null, createdAt: "" });
const epoch = (comments: string[]): Epoch => ({ sessionId: "s", n: 1, phase: "reviewerComments", status: "succeeded", input: { comments }, error: null, startedAt: "", endedAt: "" });

test("newReviewerComments excludes own, done, and already interpreted phids while retaining new replies", () => {
  const result = newReviewerComments({ artifacts: [
    artifact("own", { byMe: true }), artifact("done", { done: true }),
    artifact("edited", { version: 1 }), artifact("edited", { version: 2 }),
    artifact("new-reply"),
  ], epochs: [epoch(["edited"])] });
  assert.deepEqual(result, ["new-reply"]);
});

test("after an adopt, comments created before the latest round submit are history", () => {
  const round: Epoch = { sessionId: "s", n: 2, phase: "round", status: "succeeded", error: null, startedAt: "", endedAt: "", input: { narrate: true, round: { kind: "local", base: "b", head: "h", host: "H", phab: [{ revision: 1, diffId: 20, base: "b", dateCreated: 1000, title: "t", latestDiffId: 20 }, { revision: 2, diffId: 21, base: "b", dateCreated: 1004, title: "t", latestDiffId: 21 }] } } };
  const result = newReviewerComments({ artifacts: [artifact("old", { dateCreated: 999 }), artifact("general-old", { dateCreated: 1003 }), artifact("new", { dateCreated: 1005 })], epochs: [round] });
  assert.deepEqual(result, ["new"]);
});

test("check waits while an epoch runs or the workflow has an open decision", async () => {
  let running: object | null = {};
  let next: object | null = null;
  let runs = 0;
  const rt = {
    store: { getSession: () => ({ workflow: "implement" }) },
    runningEpoch: () => running,
    nextStep: () => next,
    runPhase: async () => { runs++; },
    advance: async () => {},
  } as unknown as Runtime;
  const watcher = new CommentWatcher(rt);
  await watcher.check("s");
  running = null;
  next = {};
  await watcher.check("s");
  assert.equal(runs, 0);
});
