// REQUIRES_REAL_GIT
// REQUIRES_REAL_NET
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SessionState } from "../../../../src/shared/types.ts";
import { base, newSession, post, rt, waitFor } from "../../../helpers/http-server.ts";

test("a round without a narrative can be narrated once on demand", async () => {
  const session = await newSession();
  const diff = rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", provenance: { taskId: "test" },
    data: { baseSha: "HEAD~1", headSha: "HEAD", commits: [{ sha: "head", subject: "round change", body: "" }], files: [
      { path: "a.txt", status: "modified", binary: false, hunks: [{ id: "f0h0", header: "", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "add", text: "change" }] }] },
      { path: "b.txt", status: "modified", binary: false, hunks: [{ id: "f1h0", header: "", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "add", text: "change" }] }] },
    ] } });
  const path = `/api/sessions/${session.id}/rounds/${diff.id}/narrate`;
  assert.equal((await post(`/api/sessions/${session.id}/rounds/missing/narrate`, {})).status, 404);
  assert.equal((await post(path, {})).status, 202);
  const completed = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.artifacts.some((artifact) => artifact.type === "PatchNarrative" && (artifact.data as { diffId: string }).diffId === diff.id)
      && snapshot.tasks.every((task) => task.status !== "running" && task.status !== "pending")
      ? snapshot : undefined;
  });
  assert.ok(completed.artifacts.some((artifact) => artifact.type === "PatchNarrative" && (artifact.data as { diffId: string }).diffId === diff.id));
  assert.equal((await post(path, {})).status, 409);
});
