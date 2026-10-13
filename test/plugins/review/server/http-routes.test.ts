// REQUIRES_REAL_GIT
// REQUIRES_REAL_NET
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { createServer as createNetServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../../../src/runtime/store.ts";
import { Runtime } from "../../../../src/runtime/tasks.ts";
import type { WebspecCapability } from "../../../../src/plugins/spec/runtime/webspec.ts";
import { makeGit } from "../../../../src/runtime/git/read.ts";
import { corePlugin } from "../../../../src/runtime/create.ts";
import { plugins } from "../../../../src/plugins/index.ts";
import { createHttpServer } from "../../../../src/server/http.ts";
import type { LlmService } from "../../../../src/runtime/llm/types.ts";
import type { DiffData, Session, SessionState, WorkflowStartData } from "../../../../src/shared/types.ts";
import { commitRevision } from "../../../../src/plugins/review/shared/phabricator.ts";
import { reviewRoutes } from "../../../../src/plugins/review/server/routes.ts";
import { lookupSpecRef } from "../../../../src/plugins/review/tasks/lookup-spec-ref/task.ts";
import { makeRepo } from "../../../helpers/git-fixture.ts";
import { CHAT_REPLY, NARRATIVE, base, llm, newSession, post, put, repo, replyFor, reviewFor, rt, staticDir, state, waitFor } from "../../../helpers/http-server.ts";
import { specTestServices } from "../../../helpers/spec-services.ts";

test("reviewed marks validate narrative and change, then create a user artifact", async () => {
  const session = await newSession();
  const diff = rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", provenance: { taskId: "test" },
    data: { baseSha: "b", headSha: "h", commits: [{ sha: "1", subject: "s", body: "" }], files: [{ path: "a", status: "modified", binary: false, hunks: [{ id: "h1", header: "", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "add", text: "x" }] }] }] } });
  const narrative = rt.store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed",
    data: { diffId: diff.id, summary: "s", changes: [{ id: "c1", title: "t", explanation: "e", rationale: "r", hunkIds: [], dependsOn: [], specUrls: [] }] }, provenance: { taskId: "test" } });
  const route = `/api/sessions/${session.id}/narratives/${narrative.id}/changes`;
  assert.equal((await post(`${route}/c1/reviewed`, { reviewed: "yes" })).status, 400);
  assert.equal((await post(`/api/sessions/${session.id}/narratives/missing/changes/c1/reviewed`, { reviewed: true })).status, 404);
  assert.equal((await post(`${route}/c9/reviewed`, { reviewed: true })).status, 404);
  assert.equal((await post(`${route}/unassigned-C1/reviewed`, { reviewed: true })).status, 201);
  assert.equal((await post(`${route}/unassigned-C2/reviewed`, { reviewed: true })).status, 404);
  const response = await post(`${route}/c1/reviewed`, { reviewed: true });
  assert.equal(response.status, 201);
  const { artifactId } = await response.json();
  const artifact = rt.store.getArtifact(artifactId);
  assert.equal(artifact.type, "ChangeReview");
  assert.deepEqual(artifact.data, { narrative: narrative.id, change: "c1", reviewed: true });
  assert.deepEqual(artifact.provenance, { taskId: "user" });
  assert.ok(rt.store.listLinks(session.id).some((link) => link.from === artifact.id && link.to === `${narrative.id}#c1` && link.kind === "about"));
});

test("narrate runs in background and state reflects the result", async () => {
  const session = await newSession();
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" })).status, 202);
  const state = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.tasks.some((task) => task.kind === "review") && snapshot.tasks.every((task) => task.status !== "running" && task.status !== "pending") ? snapshot : undefined;
  });
  assert.ok(state.artifacts.some((artifact) => artifact.type === "PatchNarrative"));
  assert.deepEqual(state.tasks.map((task) => [task.kind, task.status]), [["importDiff", "succeeded"], ["introducedSymbols", "succeeded"], ["narrate", "succeeded"], ["resolveSpecRefs", "succeeded"], ["review", "succeeded"]]);
  assert.ok(state.lastEventId > 0);
  assert.deepEqual(state.plugins, {});
  const repeated = await post(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
  assert.equal(repeated.status, 409);
  assert.deepEqual(await repeated.json(), { error: "Session already has a narrative" });
});

test("narrate retries a failed workflow before a Diff exists", async () => {
  const session = await newSession();
  const start = rt.store.putArtifact<WorkflowStartData>({ sessionId: session.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" }, data: { via: "command", workflow: "review", profile: "plain-git", params: { base: "HEAD~1", head: "HEAD", revision: null }, title: "review", prompt: "HEAD~1..HEAD" } });
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, {})).status, 202);
  const state = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.tasks.some((task) => task.kind === "review" && task.status === "succeeded") ? snapshot : undefined;
  });
  assert.ok(rt.store.getArtifact(start.id));
  assert.ok(state.artifacts.some((artifact) => artifact.type === "PatchNarrative"));
});

test("narrate Retry reruns a failed review phase in the same epoch and reuses its Diff", async () => {
  const session = await newSession();
  state.failNarrationOnce = true;
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" })).status, 202);
  const failed = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.epochs.at(-1)?.status === "failed" ? snapshot : undefined;
  });
  assert.deepEqual(failed.epochs.map(({ n, phase, status }) => ({ n, phase, status })), [{ n: 1, phase: "review", status: "failed" }]);
  assert.equal(failed.artifacts.filter((artifact) => artifact.type === "Diff").length, 1);
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, {})).status, 202);
  const retried = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.epochs.at(-1)?.status === "succeeded" ? snapshot : undefined;
  });
  assert.deepEqual(retried.epochs.map(({ n, phase, status }) => ({ n, phase, status })), [{ n: 1, phase: "review", status: "succeeded" }]);
  assert.equal(retried.artifacts.filter((artifact) => artifact.type === "Diff").length, 1);
});

test("narrate without a Diff still rejects a session without a WorkflowStart", async () => {
  const session = await newSession();
  const response = await post(`/api/sessions/${session.id}/narrate`, {});
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Missing string field: base" });
});

test("narrate reuses the latest Diff and rejects narrating it twice", async () => {
  const session = await newSession();
  await post(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
  const first = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.tasks.some((task) => task.kind === "review" && task.status === "succeeded") && !rt.runningEpoch(session.id) ? snapshot : undefined;
  });
  const original = first.artifacts.find((item) => item.type === "Diff")!;
  const second = rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: { ...(original.data as DiffData), headSha: "new-head" }, provenance: { taskId: "test" } });
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, {})).status, 202);
  const updated = await waitFor(async () => {
    const snapshot: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return snapshot.artifacts.some((item) => item.type === "PatchNarrative" && (item.data as { diffId: string }).diffId === second.id) ? snapshot : undefined;
  });
  assert.equal(updated.artifacts.filter((item) => item.type === "Diff").length, 2);
  const repeated = await post(`/api/sessions/${session.id}/narrate`, {});
  assert.equal(repeated.status, 409);
  assert.deepEqual(await repeated.json(), { error: "Session already has a narrative" });
  const trailered: DiffData = { ...(original.data as DiffData), headSha: "third-head", commits: [{ sha: "third-head", subject: "change", body: "Differential Revision: https://phab.example.com/D1" }] };
  rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: trailered, provenance: { taskId: "test" } });
  const drafts = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "comment", body: "" });
  assert.equal(drafts.status, 400);
  assert.deepEqual(await drafts.json(), { error: "Nothing to submit" });
});

test("update imports a moved feature ref as a new epoch and detects no-op updates", async () => {
  const testRepo = makeRepo();
  const originalBase = testRepo.commit({ "a.txt": "base\n", "b.txt": "base\n" }, "base");
  testRepo.git("checkout", "-q", "-b", "feature");
  testRepo.commit({ "a.txt": "first\n", "c.txt": "feature\n" }, "first revision");
  const session: Session = await (await post("/api/sessions", { repo: testRepo.dir, title: "update" })).json();
  assert.equal((await post(`/api/sessions/${session.id}/narrate`, { base: "main", head: "feature" })).status, 202);
  await waitFor(async () => {
    const state: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return state.tasks.some((task) => task.kind === "review" && task.status === "succeeded") ? state : undefined;
  });
  testRepo.commit({ "a.txt": "second\n", "b.txt": "base\n" }, "amended revision");
  assert.equal((await post(`/api/sessions/${session.id}/update`, {})).status, 202);
  const state = await waitFor(async () => {
    const current: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return current.artifacts.filter((artifact) => artifact.type === "Diff").length === 2
      && current.tasks.filter((task) => task.kind === "review" && task.status === "succeeded").length === 2
      && current.tasks.every((task) => task.status !== "running" && task.status !== "pending")
      ? current : undefined;
  });
  assert.equal(state.artifacts.filter((artifact) => artifact.type === "Diff").length, 2);
  const updatedDiff = state.artifacts.filter((artifact) => artifact.type === "Diff").at(-1)!;
  const interdiffArtifact = state.artifacts.find((artifact) => artifact.type === "Interdiff")!;
  assert.equal((interdiffArtifact.data as { toDiff: string }).toDiff, updatedDiff.id);
  assert.deepEqual(state.tasks.slice(-7).map((task) => [task.kind, task.status]), [
    ["importDiff", "succeeded"], ["interdiff", "succeeded"], ["introducedSymbols", "succeeded"],
    ["narrate", "succeeded"], ["carryFindings", "succeeded"], ["resolveSpecRefs", "succeeded"], ["review", "succeeded"],
  ]);
  assert.equal((state.artifacts.find((artifact) => artifact.type === "PatchNarrative" && (artifact.data as { diffId: string }).diffId === updatedDiff.id)!.data as { previous?: string }).previous,
    state.artifacts.find((artifact) => artifact.type === "PatchNarrative" && (artifact.data as { diffId: string }).diffId !== updatedDiff.id)!.id);
  assert.ok(rt.store.listLinks(session.id).some((link) => link.from === interdiffArtifact.id && link.to === updatedDiff.id && link.kind === "about"));
  const again = await post(`/api/sessions/${session.id}/update`, {});
  assert.equal(again.status, 409);
  assert.deepEqual(await again.json(), { error: "No new revision" });

  testRepo.git("checkout", "-q", "main");
  const movedBase = testRepo.commit({ "a.txt": "base\n", "b.txt": "upstream\n" }, "upstream moved");
  testRepo.git("checkout", "-q", "feature");
  testRepo.commit({ "a.txt": "third\n", "b.txt": "base\n" }, "feature without rebase");
  assert.equal((await post(`/api/sessions/${session.id}/update`, {})).status, 202);
  const thirdState = await waitFor(async () => {
    const current: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return current.artifacts.filter((artifact) => artifact.type === "Diff").length === 3 && current.tasks.filter((task) => task.kind === "review" && task.status === "succeeded").length === 3 ? current : undefined;
  });
  const thirdDiff = thirdState.artifacts.filter((artifact) => artifact.type === "Diff").at(-1)!;
  assert.equal((thirdDiff.data as DiffData).baseSha, originalBase);
  assert.notEqual((thirdDiff.data as DiffData).baseSha, movedBase);

  testRepo.commit({ "a.txt": "fourth\n", "b.txt": "base\n" }, "feature while task pending");
  rt.store.createTask({ sessionId: session.id, kind: "carryFindings", input: {} });
  const busy = await post(`/api/sessions/${session.id}/update`, {});
  assert.equal(busy.status, 409);
  assert.deepEqual(await busy.json(), { error: "A task is already running" });
});

test("update requires an imported diff", async () => {
  const session = await newSession();
  const response = await post(`/api/sessions/${session.id}/update`, {});
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "Session has no imported diff" });
});

test("narrate rejects a second request while narration is running", async () => {
  let started!: () => void;
  let release!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const gatedLlm: LlmService = {
    ...llm,
    async run(selection, prompt) {
      if (prompt.schema) { started(); await gate; }
      const chat = replyFor(prompt);
      const review = reviewFor(prompt);
      return { text: "hi", json: prompt.schema ? chat ? CHAT_REPLY : review ? { findings: [], verdicts: [] } : NARRATIVE : undefined, providerSessionId: "p", selection: selection ?? this.defaultSelection };
    },
  };
  const gatedRt = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, ...plugins], llm: gatedLlm, git: makeGit });
  const gatedServer = createHttpServer(gatedRt, { staticDir });
  await new Promise<void>((resolve) => gatedServer.listen(0, "127.0.0.1", resolve));
  try {
    const gatedBase = `http://127.0.0.1:${(gatedServer.address() as AddressInfo).port}`;
    const create = (path: string, body: unknown) => fetch(gatedBase + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const session: Session = await (await create("/api/sessions", { repo: repo.dir, title: "gated narration" })).json();
    assert.equal((await create(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" })).status, 202);
    await startedPromise;
    const repeated = await create(`/api/sessions/${session.id}/narrate`, { base: "HEAD~1", head: "HEAD" });
    assert.equal(repeated.status, 409);
    assert.deepEqual(await repeated.json(), { error: "Narration already running" });
  } finally {
    release();
    await new Promise<void>((resolve) => gatedServer.close(() => resolve()));
  }
});

test("finding decisions trigger comments on accept and regeneration requires latest accept", async () => {
  const session = await newSession();
  const finding = rt.store.putArtifact({ sessionId: session.id, type: "ReviewFinding", status: "proposed",
    data: { anchor: "diff#f0h0", category: "correctness", severity: "medium", title: "Finding", body: "Finding details." },
    provenance: { taskId: "review" } });
  const path = `/api/sessions/${session.id}/findings/${finding.id}/decide`;
  assert.equal((await post(path, { decision: "other" })).status, 400);
  assert.equal((await post(`/api/sessions/${session.id}/findings/missing/decide`, { decision: "accepted" })).status, 404);

  const accepted = await post(path, { decision: "accepted" });
  assert.equal(accepted.status, 201);
  const acceptedId = (await accepted.json() as { artifactId: string }).artifactId;
  assert.equal(rt.store.getArtifact(acceptedId).type, "FindingDecision");
  assert.deepEqual(rt.store.getArtifact(acceptedId).provenance, { taskId: "user" });
  assert.ok(rt.store.listLinks(session.id).some((link) => link.from === acceptedId && link.to === finding.id && link.kind === "about"));
  await waitFor(async () => {
    const state: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return state.tasks.some((task) => task.kind === "comment" && task.status === "succeeded") ? true : undefined;
  });
  assert.equal(rt.store.listArtifacts(session.id, "ReviewComment").length, 1);

  const dismissed = await post(path, { decision: "dismissed" });
  assert.equal(dismissed.status, 201);
  const decisions = rt.store.listArtifacts(session.id, "FindingDecision");
  assert.equal(decisions.length, 2);
  assert.equal((decisions.at(-1)!.data as { decision: string }).decision, "dismissed");
  const regenerate = `/api/sessions/${session.id}/findings/${finding.id}/comment/regenerate`;
  assert.equal((await post(regenerate, {})).status, 409);
  assert.equal((await post(path, { decision: "accepted" })).status, 201);
  assert.equal((await post(regenerate, {})).status, 202);
  await waitFor(async () => {
    const state: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    return state.tasks.filter((task) => task.kind === "comment").length === 3 && state.tasks.filter((task) => task.kind === "comment").every((task) => task.status === "succeeded") ? true : undefined;
  });
  assert.equal(rt.store.listArtifacts(session.id, "ReviewComment").length, 3);
});

test("editing a finding comment appends verified user artifacts", async () => {
  const session = await newSession();
  const finding = rt.store.putArtifact({ sessionId: session.id, type: "ReviewFinding", status: "proposed",
    data: { anchor: "diff#f0h0", category: "correctness", severity: "medium", title: "Finding", body: "Finding details." },
    provenance: { taskId: "review" } });
  const path = `/api/sessions/${session.id}/findings/${finding.id}/comment`;
  assert.equal((await put(path, { body: " \n " })).status, 400);
  const first = await put(path, { body: "Use a strong ref." });
  assert.equal(first.status, 201);
  const second = await put(path, { body: "Use a strong reference." });
  assert.equal(second.status, 201);
  const artifacts = rt.store.listArtifacts(session.id, "ReviewComment");
  assert.equal(artifacts.length, 2);
  assert.equal(artifacts.at(-1)!.status, "verified");
  assert.deepEqual(artifacts.at(-1)!.data, { finding: finding.id, body: "Use a strong reference." });
  assert.deepEqual(artifacts.at(-1)!.provenance, { taskId: "user" });
  assert.ok(rt.store.listLinks(session.id).some((link) => link.from === artifacts.at(-1)!.id && link.to === finding.id && link.kind === "about"));
  assert.equal((await put(`/api/sessions/${session.id}/findings/missing/comment`, { body: "x" })).status, 404);
});

test("review-submit rejects a revision without a Differential Revision trailer", async () => {
  const session = await newSession();
  rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: {
    baseSha: "base", headSha: "head", commits: [{ sha: "head", subject: "change", body: "No trailer" }], files: [],
  }, provenance: { taskId: "test" } });
  const response = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "comment", body: "" });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /No commit of the stack is D1/);
});

test("review-submit posts inline drafts then submits the review action", async () => {
  const testRepo = makeRepo();
  const baseSha = testRepo.commit({ "a.txt": "before\n" }, "base");
  const headSha = testRepo.commit({ "a.txt": "after\n" }, "change\n\nDifferential Revision: https://phab.example.com/D1");
  const session = rt.store.createSession({ worktree: testRepo.dir, repoDir: `${testRepo.dir}/.git`, title: "draft posting" });
  const diffData: DiffData = { baseSha, headSha, commits: [{ sha: headSha, subject: "change", body: "Differential Revision: https://phab.example.com/D1" }], files: [] };
  const previousDiff = rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: { ...diffData, headSha: "previous" }, provenance: { taskId: "test" } });
  const previousNarrative = rt.store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: { diffId: previousDiff.id, summary: "previous", changes: [] }, provenance: { taskId: "test" } });
  const diff = rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: diffData, provenance: { taskId: "test" } });
  rt.store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: { diffId: diff.id, summary: "s", changes: [] }, provenance: { taskId: "test" } });
  const finding = rt.store.putArtifact({ sessionId: session.id, type: "ReviewFinding", status: "proposed", data: {
    anchor: `${previousDiff.id}#f0h0`, lines: { path: "a.txt", side: "new", start: 1, end: 1 }, category: "correctness", severity: "high", title: "Finding", body: "Details",
  }, provenance: { taskId: "test" } });
  rt.store.putLink({ sessionId: session.id, from: finding.id, to: previousNarrative.id, kind: "derivedFrom" });
  const carry = rt.store.putArtifact({ sessionId: session.id, type: "FindingCarry", status: "verified", data: { finding: finding.id, toDiff: diff.id, hunkId: "f0h0", lines: { path: "a.txt", side: "new", start: 8, end: 8 } }, provenance: { taskId: "carry" } });
  rt.store.putLink({ sessionId: session.id, from: carry.id, to: finding.id, kind: "about" });
  const decision = rt.store.putArtifact({ sessionId: session.id, type: "FindingDecision", status: "verified", data: { finding: finding.id, decision: "accepted" }, provenance: { taskId: "user" } });
  rt.store.putLink({ sessionId: session.id, from: decision.id, to: finding.id, kind: "about" });
  const comment = rt.store.putArtifact({ sessionId: session.id, type: "ReviewComment", status: "verified", data: { finding: finding.id, body: "Please update this." }, provenance: { taskId: "user" } });
  rt.store.putLink({ sessionId: session.id, from: comment.id, to: finding.id, kind: "about" });
  const userComment = rt.store.putArtifact({ sessionId: session.id, type: "UserComment", status: "verified", data: { diffId: diff.id, lines: { path: "a.txt", side: "new", start: 1, end: 1 }, body: "Check this too.", replaces: null, deleted: false }, provenance: { taskId: "user" } });

  const remote = await makeGit(testRepo.dir).diff(baseSha, headSha);
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const inlineLines: number[] = [];
  let mode: "normal" | "drift" | "http-error" = "normal";
  const conduitServer = createNetServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const form = new URLSearchParams(body);
    const method = req.url!.slice("/api/".length);
    const params = JSON.parse(form.get("params")!);
    calls.push({ method, params });
    if (method === "differential.createinline") inlineLines.push(params.lineNumber);
    if (mode === "http-error") {
      res.writeHead(500).end("failure");
      return;
    }
    const result = method === "differential.revision.search" ? { data: [{ phid: "PHID-DREV-1" }] }
      : method === "differential.diff.search" ? { data: [{ id: 7 }] }
        : method === "differential.getrawdiff" ? mode === "drift" ? remote.replace("+after", "+different") : remote
      : method === "differential.createinline" ? { id: calls.filter((call) => call.method === method).length + 8 }
        : method === "differential.createcomment" ? { id: 10 }
            : null;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ error_code: null, error_info: null, result }));
  });
  await new Promise<void>((resolve) => conduitServer.listen(0, "127.0.0.1", resolve));
  const arcrc = join(mkdtempSync(join(tmpdir(), "spatial-arcrc-")), "arcrc");
  writeFileSync(arcrc, JSON.stringify({ hosts: { "https://phab.example.com/api/": { token: "test-token" } } }));
  const oldArcrc = process.env.SPATIAL_ARCRC_PATH;
  const oldConduit = process.env.SPATIAL_CONDUIT_BASE_URL;
  process.env.SPATIAL_ARCRC_PATH = arcrc;
  process.env.SPATIAL_CONDUIT_BASE_URL = `http://127.0.0.1:${(conduitServer.address() as AddressInfo).port}`;
  try {
    const response = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "request-changes", body: "Please revise." });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { inlines: 2, skipped: [], revision: "D1" });
    assert.deepEqual(calls.map((call) => call.method), ["differential.revision.search", "differential.diff.search", "differential.getrawdiff", "differential.createinline", "differential.createinline", "differential.createcomment"]);
    const { __conduit__: _token, ...submitted } = calls.at(-1)!.params;
    assert.deepEqual(submitted, { revision_id: 1, message: "Please revise.", action: "reject", attach_inlines: true });
    assert.deepEqual(inlineLines, [8, 1]);
    const posted = rt.store.listArtifacts(session.id, "PostedComment");
    assert.equal(posted.length, 2);
    assert.deepEqual(posted[0]!.data, { comment: comment.id, source: finding.id, revision: 1, diff: 7, inlineId: 9 });
    assert.deepEqual(posted[0]!.provenance, { taskId: "runtime" });
    assert.deepEqual(posted[1]!.data, { comment: userComment.id, source: userComment.id, revision: 1, diff: 7, inlineId: 10 });
    assert.deepEqual(rt.store.listArtifacts(session.id, "ReviewSubmission").at(-1)!.data, { revision: 1, action: "request-changes", body: "Please revise.", inlines: 2 });

    mode = "normal";
    const repeat = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "accept", body: "" });
    assert.equal(repeat.status, 200);
    assert.deepEqual(await repeat.json(), { inlines: 0, skipped: [], revision: "D1" });
    assert.equal(calls.filter((call) => call.method === "differential.createinline").length, 2);

    mode = "drift";
    const beforeDriftWrites = calls.length;
    const drifted = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "accept", body: "" });
    assert.equal(drifted.status, 409);
    assert.match((await drifted.json()).error, /a.txt/);
    assert.equal(calls.length, beforeDriftWrites + 3);

    mode = "http-error";
    const upstreamFailure = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "comment", body: "Second submit." });
    assert.equal(upstreamFailure.status, 502);
    const beforeEmpty = calls.length;
    const empty = await post(`/api/sessions/${session.id}/review-submit`, { revision: 1, action: "comment", body: "" });
    assert.equal(empty.status, 400);
    assert.equal(calls.length, beforeEmpty);
  } finally {
    if (oldArcrc === undefined) delete process.env.SPATIAL_ARCRC_PATH;
    else process.env.SPATIAL_ARCRC_PATH = oldArcrc;
    if (oldConduit === undefined) delete process.env.SPATIAL_CONDUIT_BASE_URL;
    else process.env.SPATIAL_CONDUIT_BASE_URL = oldConduit;
    await new Promise<void>((resolve) => conduitServer.close(() => resolve()));
  }
});

test("file context endpoint serves modified text at diff head and rejects unsupported files", async () => {
  const session = await newSession();
  const { diffId } = await rt.run<{ diffId: string }>(session.id, "importDiff", { base: "HEAD~1", head: "HEAD" });
  const response = await fetch(`${base}/api/sessions/${session.id}/diffs/${diffId}/file?path=a.txt`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { lines: ["1", "TWO"] });
  const added = await fetch(`${base}/api/sessions/${session.id}/diffs/${diffId}/file?path=c.txt`);
  assert.equal(added.status, 400);
  assert.equal((await added.json()).error, "Context is only available for modified or renamed text files");
  assert.equal((await fetch(`${base}/api/sessions/${session.id}/diffs/${diffId}/file?path=missing`)).status, 404);
  assert.equal((await fetch(`${base}/api/sessions/${session.id}/diffs/nope/file?path=a.txt`)).status, 404);
  const foreign = await newSession();
  assert.equal((await fetch(`${base}/api/sessions/${foreign.id}/diffs/${diffId}/file?path=a.txt`)).status, 404);
  const notDiff = rt.store.putArtifact({ sessionId: session.id, type: "Other", status: "verified", data: {}, provenance: { taskId: "task" } });
  assert.equal((await fetch(`${base}/api/sessions/${session.id}/diffs/${notDiff.id}/file?path=a.txt`)).status, 404);
});

test("import-revision materializes a remote patch and starts narration", async () => {
  const target = makeRepo();
  const baseSha = target.commit({ "a.txt": "1\n2\n" }, "base");
  const scratch = makeRepo();
  const scratchBase = scratch.commit({ "a.txt": "1\n2\n" }, "base");
  const scratchHead = scratch.commit({ "a.txt": "1\nTWO\n", "c.txt": "c\n" }, "remote change");
  const rawDiff = `${scratch.git("diff", scratchBase, scratchHead)}\n`;
  const calls: string[] = [];
  const conduitServer = createNetServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const method = req.url!.slice("/api/".length);
    calls.push(method);
    const result = method === "differential.revision.search" ? { data: [{ phid: "PHID-DREV-1", id: 1, fields: { title: "Remote change", status: { closed: false }, stackGraph: { "PHID-DREV-1": [] } } }] }
      : method === "differential.diff.search" ? { data: [{ id: 7, fields: { dateCreated: 1791278237, refs: [{ type: "base", identifier: baseSha }] } }] }
        : method === "differential.getrawdiff" ? rawDiff : null;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ error_code: null, error_info: null, result }));
  });
  await new Promise<void>((resolve) => conduitServer.listen(0, "127.0.0.1", resolve));
  const arcrc = join(mkdtempSync(join(tmpdir(), "spatial-arcrc-")), "arcrc");
  writeFileSync(arcrc, JSON.stringify({ hosts: { "https://phab.example.com/api/": { token: "test-token" } } }));
  const oldArcrc = process.env.SPATIAL_ARCRC_PATH;
  const oldConduit = process.env.SPATIAL_CONDUIT_BASE_URL;
  process.env.SPATIAL_ARCRC_PATH = arcrc;
  process.env.SPATIAL_CONDUIT_BASE_URL = `http://127.0.0.1:${(conduitServer.address() as AddressInfo).port}`;
  const session = await (await post("/api/sessions", { repo: target.dir, title: "remote", workflow: "review" })).json() as Session;
  const before = target.git("status", "--porcelain");
  try {
    const response = await post(`/api/sessions/${session.id}/import-revision`, { host: "https://phab.example.com", id: 1 });
    assert.equal(response.status, 202);
    const range = await response.json() as { base: string; head: string };
    assert.equal(range.base, baseSha);
    assert.notEqual(range.head, baseSha);
    await waitFor(async () => (await (await fetch(`${base}/api/sessions/${session.id}/state`)).json() as SessionState).artifacts.find((item) => item.type === "PatchNarrative"));
    const state: SessionState = await (await fetch(`${base}/api/sessions/${session.id}/state`)).json();
    const imported = state.artifacts.find((item) => item.type === "Diff")!;
    assert.equal((imported.data as DiffData).baseSha, range.base);
    assert.equal((imported.data as DiffData).headSha, range.head);
    const data = imported.data as DiffData;
    assert.equal(data.commits.length, 1);
    assert.deepEqual(commitRevision(data.commits[0]!), { host: "https://phab.example.com", id: 1 });
    assert.ok(calls.every((method) => ["differential.revision.search", "differential.diff.search", "differential.getrawdiff"].includes(method)));
    assert.deepEqual(calls, ["differential.revision.search", "differential.diff.search", "differential.getrawdiff"]);
    assert.equal(target.git("rev-parse", "HEAD"), baseSha);
    assert.equal(target.git("status", "--porcelain"), before);
  } finally {
    if (oldArcrc === undefined) delete process.env.SPATIAL_ARCRC_PATH;
    else process.env.SPATIAL_ARCRC_PATH = oldArcrc;
    if (oldConduit === undefined) delete process.env.SPATIAL_CONDUIT_BASE_URL;
    else process.env.SPATIAL_CONDUIT_BASE_URL = oldConduit;
    await new Promise<void>((resolve) => conduitServer.close(() => resolve()));
  }
});

test("mapping a spec's steps needs a narrative and a spec with steps supporting its changes", async () => {
  const session = await newSession();
  const path = (specId: string) => `/api/sessions/${session.id}/specs/${specId}/map`;
  assert.equal((await post(path("none"), {})).status, 409);
  const put = (type: string, data: unknown) => rt.store.putArtifact({ sessionId: session.id, type, status: "verified", data, provenance: { taskId: "x" } });
  const diff = put("Diff", { baseSha: "B", headSha: "H", commits: [], files: [{ path: "a.txt", status: "modified", binary: false, hunks: [{ id: "f0h0", header: "", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "add", text: "x" }] }] }] });
  const narrative = put("PatchNarrative", { diffId: diff.id, summary: "s", changes: [{ id: "c1", title: "t", explanation: "e", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] }] });
  const resolved = { spec: "HTML", anchor: "a", title: "a", type: "algorithm", url: "https://h/#a", content: "1. Do it." };
  const prose = put("SpecReference", { url: resolved.url, resolved: { ...resolved, content: "No steps." }, origin: "code", geckoRefs: [] });
  const steps = put("SpecReference", { url: resolved.url, resolved, origin: "code", geckoRefs: [] });
  for (const spec of [prose, steps]) rt.store.putLink({ sessionId: session.id, from: spec.id, to: `${narrative.id}#c1`, kind: "supports" });
  assert.equal((await post(path(prose.id), {})).status, 409);
  const started = await post(path(steps.id), {});
  assert.equal(started.status, 202);
  const { taskId } = await started.json() as { taskId: string };
  assert.deepEqual(rt.store.getTask(taskId).input, { narrativeId: narrative.id, specId: steps.id });
});

test("spec ref lookup reuses existing sections and caches newly linked sections", async () => {
  const routeStore = new Store(":memory:");
  const routeWebspec: WebspecCapability = {
    effect: "read-only", async analyze() { return []; }, async lookup() { throw new Error("not used"); },
    async query() { throw new Error("not used"); }, async search() { throw new Error("not used"); }, async refs() { throw new Error("not used"); }, async idl() { throw new Error("not used"); }, async effectPaths() { throw new Error("not used"); },
    async resolve(ref) { const anchor = ref.split("#").at(-1)!; return { found: true, spec: { spec: "HTML", anchor, title: anchor, type: "section", url: `https://html.spec.whatwg.org/#${anchor}`, content: "Section." } }; },
  };
  const routeRuntime = new Runtime({ store: routeStore, plugins: [{ id: "route-test", tasks: [lookupSpecRef] }], llm, git: () => ({}) as never, services: specTestServices({ webspec: routeWebspec }) });
  const session = routeStore.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const resolved = { spec: "HTML", anchor: "existing", title: "Existing", type: "section", url: "https://html.spec.whatwg.org/#existing", content: "Existing." };
  const existing = routeStore.putArtifact({ sessionId: session.id, type: "SpecReference", status: "verified", data: { url: resolved.url, resolved, origin: "code", geckoRefs: [] }, provenance: { taskId: "x" } });
  const route = reviewRoutes(routeRuntime).find(([method, pattern]) => method === "POST" && pattern.test(`/api/sessions/${session.id}/spec-refs`))![2];
  const call = async (ref: string) => {
    let status = 0, body = "";
    const req = Readable.from([JSON.stringify({ ref })]);
    const res = { writeHead(code: number) { status = code; return this; }, end(value?: string) { body = value ?? ""; return this; } };
    await route({ req: req as never, res: res as never, params: [session.id], url: new URL(`http://local/api/sessions/${session.id}/spec-refs`) });
    return { status, body: body ? JSON.parse(body) as { specId: string } : null };
  };
  const reused = await call("HTML#existing");
  assert.equal(reused.status, 200);
  assert.deepEqual(reused.body, { specId: existing.id });
  assert.equal(routeStore.listTasks(session.id).some((task) => task.kind === "lookupSpecRef"), false);
  const created = await call("HTML#setup");
  assert.equal(created.status, 201);
  const { specId } = created.body!;
  const again = await call("HTML#setup");
  assert.equal(again.status, 200);
  assert.deepEqual(again.body, { specId });
  assert.equal(routeStore.listArtifacts(session.id, "SpecReference").length, 2);
  assert.equal(routeStore.listTasks(session.id).filter((task) => task.kind === "lookupSpecRef").length, 1);
});
