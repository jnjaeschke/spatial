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
