// REQUIRES_REAL_NET
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime } from "../../../src/runtime/tasks.ts";
import type { GitCapability } from "../../../src/runtime/tasks.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { createHttpServer } from "../../../src/server/http.ts";

test("reviewer comment routes validate triage and require a reviewer comments epoch", async () => {
  const store = new Store(":memory:");
  const rt = new Runtime({ store, plugins: [specPlugin, reviewPlugin, implementPlugin], llm: {} as never, git: () => ({}) as GitCapability });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t", workflow: "implement" });
  const comment = store.putArtifact({ sessionId: session.id, type: "PhabComment", status: "verified", data: { phid: "PHID-XCMT-1" }, provenance: { taskId: "test" } });
  const server = createHttpServer(rt);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await post(`/api/sessions/${session.id}/reviewer-comments/${comment.id}/triage`, { action: "bad" })).status, 400);
    assert.equal((await post(`/api/sessions/${session.id}/reviewer-comments/missing/triage`, { action: "ignore" })).status, 404);
    const marked = await post(`/api/sessions/${session.id}/reviewer-comments/${comment.id}/triage`, { action: "reply", text: " thanks " });
    assert.equal(marked.status, 201);
    const triage = store.listArtifacts(session.id, "CommentTriage")[0]!;
    assert.deepEqual(triage.data, { comment: comment.id, phid: "PHID-XCMT-1", action: "reply", text: "thanks" });
    assert.ok(store.listLinks(session.id).some((link) => link.from === triage.id && link.to === comment.id && link.kind === "about"));
    assert.equal((await post(`/api/sessions/${session.id}/reviewer-comments/post-replies`, {})).status, 409);
  } finally { server.close(); store.close(); }
});
