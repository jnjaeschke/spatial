import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../src/runtime/create.ts";
import { RevisionWatcher } from "../src/runtime/revision-watcher.ts";
import { PhabricatorSyncer } from "../src/runtime/phabricator-sync.ts";
import { createSession, makeGit } from "../src/runtime/git.ts";
import type { WorkflowStartData } from "../src/shared/types.ts";
import { runWorkflow } from "../src/workflows/start.ts";
import { createHttpServer } from "../src/server/http.ts";
import { makeRepo } from "../test/helpers/git-fixture.ts";

const PORT = Number(process.env.E2E_PORT ?? 4178);
const CONDUIT_PORT = Number(process.env.E2E_CONDUIT_PORT ?? 4179);
const STUB = fileURLToPath(new URL("../test/stubs/fake-llm.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "e2e-"));
const repo = makeRepo();
const baseLines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
const base = repo.commit({ "a.txt": `${baseLines.join("\n")}\n`, ".mcp.json": JSON.stringify({ mcpServers: { "firefox-devtools": { type: "stdio", command: "node", args: ["server.js"] } } }) }, "base");
baseLines[29] = "THIRTY";
const head = repo.commit({ "a.txt": `${baseLines.join("\n")}\n`, "c.txt": "c\n" }, "Bug 1 - Change things\n\nDifferential Revision: https://phab.example.com/D1");

const narrative = {
  summary: "Edits a and adds c.",
  changes: [
    { id: "c1", title: "Edit a", explanation: "Replaces `line 30` with `THIRTY`.", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] },
    { id: "c2", title: "Add c", explanation: "Adds file c.", rationale: "r", hunkIds: ["f1h0"], dependsOn: ["c1"], specUrls: [] },
  ],
};
const out = join(dir, "claude.json");
writeFileSync(out, JSON.stringify({ type: "result", is_error: false, result: "Stub answer.\n\n- uses **`THIRTY`**\n\n```cpp\nint x = 1;\n```", structured_output: narrative, session_id: "stub-session", usage: { input_tokens: 1, output_tokens: 1 } }));
process.env.FAKE_LLM_STDOUT = out;
const chatOut = join(dir, "chat.json");
const chatAnswer = "Stub answer.\n\n- uses **`THIRTY`**\n\n```cpp\nint x = 1;\n```";
writeFileSync(chatOut, JSON.stringify({ type: "result", is_error: false, result: chatAnswer, structured_output: { answer: chatAnswer, questions: ["Should c2 really depend on c1?"], revisions: [], requestMcpServers: [] }, session_id: "stub-chat", usage: { input_tokens: 1, output_tokens: 1 } }));
const selectReviewOut = join(dir, "select-review.json");
writeFileSync(selectReviewOut, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { workflow: "review", params: { base: null, head: null, revision: null }, title: "Review via selector" }, session_id: "stub-select-review", usage: { input_tokens: 1, output_tokens: 1 } }));
const selectChatOut = join(dir, "select-chat.json");
writeFileSync(selectChatOut, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { workflow: "chat", params: {}, title: "Chat via selector" }, session_id: "stub-select-chat", usage: { input_tokens: 1, output_tokens: 1 } }));
const mcpRequestOut = join(dir, "mcp-request.json");
writeFileSync(mcpRequestOut, JSON.stringify({ type: "result", is_error: false, result: chatAnswer, structured_output: { answer: chatAnswer, questions: [], revisions: [], requestMcpServers: ["firefox-devtools"] }, session_id: "stub-chat", usage: { input_tokens: 1, output_tokens: 1 } }));
const revisedOut = join(dir, "revised-chat.json");
writeFileSync(revisedOut, JSON.stringify({ type: "result", is_error: false, result: "You are right, corrected.", structured_output: { answer: "You are right, corrected.", questions: [], revisions: [{ message: null, quote: "Stub answer.", correction: "Corrected stub answer." }], requestMcpServers: [] }, session_id: "stub-chat", usage: { input_tokens: 1, output_tokens: 1 } }));
const reviewOut = join(dir, "review.json");
writeFileSync(reviewOut, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { findings: [{ anchor: "f1h0", quote: "c", category: "tests", severity: "medium", title: "No test for c", body: "Adds `c.txt` without a test." }], verdicts: [] }, session_id: "stub-review", usage: { input_tokens: 1, output_tokens: 1 } }));
const updateReview1Out = join(dir, "update-review1.json");
writeFileSync(updateReview1Out, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { findings: [{ anchor: "f0h0", quote: "THIRTY", category: "style", severity: "low", title: "Magic number", body: "`THIRTY` is a magic value." }, { anchor: "c2", quote: null, category: "tests", severity: "medium", title: "Untested c", body: "`c.txt` has no test." }], verdicts: [] }, session_id: "stub-review1", usage: { input_tokens: 1, output_tokens: 1 } }));
const updateNarrateOut = join(dir, "update-narrative.json");
writeFileSync(updateNarrateOut, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { summary: "Since epoch 1 the author edited `line 30` and added `d.txt`.", changes: [{ id: "c1", title: "Edit a", explanation: "Edits line 30.", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] }, { id: "c2", title: "Add c", explanation: "Adds c.", rationale: "r", hunkIds: ["f1h0"], dependsOn: ["c1"], specUrls: [] }, { id: "c3", title: "Add d", explanation: "Adds d.", rationale: "r", hunkIds: ["f2h0"], dependsOn: ["c1"], specUrls: [] }] }, session_id: "stub-update-narrative", usage: { input_tokens: 1, output_tokens: 1 } }));
const updateReviewOut = join(dir, "update-review.json");
writeFileSync(updateReviewOut, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { findings: [], verdicts: [{ finding: "F2", verdict: "addressed", reason: "Test coverage for c.txt was added." }] }, session_id: "stub-update-review", usage: { input_tokens: 1, output_tokens: 1 } }));
const stubOut = (name: string, structured: object) => {
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: structured, session_id: `stub-${name}`, usage: { input_tokens: 1, output_tokens: 1 } }));
  return file;
};
const stackRewriteOut = stubOut("stack-rewrite", { summary: "Edits `a.txt` and adds `c.txt`, then rewrites line 30 again.", commitIntents: ["Replaces `line 30` and adds `c.txt`.", "Rewrites line 30 a second time."], changes: [
  { id: "c1", title: "Edit a", explanation: "Replaces `line 30`.", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] },
  { id: "c2", title: "Add c", explanation: "Adds file c.", rationale: "r", hunkIds: ["f1h0"], dependsOn: ["c1"], specUrls: [] },
  { id: "c3", title: "Rewrite line 30", explanation: "Rewrites line 30 again.", rationale: "r", hunkIds: ["f0h1"], dependsOn: ["c1"], specUrls: [] },
] });
const stackAddOut = stubOut("stack-add", { summary: "Edits `a.txt`, then adds `c.txt`.", commitIntents: ["Replaces `line 30` with `THIRTY`.", "Adds `c.txt`."], changes: [
  { id: "c1", title: "Edit a", explanation: "Replaces `line 30` with `THIRTY`.", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] },
  { id: "c2", title: "Add c", explanation: "Adds file c.", rationale: "r", hunkIds: ["f1h0"], dependsOn: ["c1"], specUrls: [] },
] });
const commentOut = join(dir, "comment.json");
writeFileSync(commentOut, JSON.stringify({ type: "result", is_error: false, result: "No test was added for the c.txt change.", structured_output: { body: "No test was added for the c.txt change." }, session_id: "stub-comment", usage: { input_tokens: 1, output_tokens: 1 } }));
process.env.FAKE_LLM_ROUTES = JSON.stringify({ "# Previous narrative": updateNarrateOut, "c.txt (added) [C1]": stackRewriteOut, "c.txt (added) [C2]": stackAddOut, "# Hunks": out, "# Prior findings\n\nF1 [": updateReviewOut, "Write a review comment as a human reviewer would.": commentOut, "ROUTE-UPDATE-REVIEW": updateReview1Out, '"findings"': reviewOut, "THAT IS WRONG": revisedOut, "ENABLE-DEVTOOLS-PLEASE": mcpRequestOut, '"revisions"': chatOut, "SELECT-ROUTE-REVIEW": selectReviewOut, "SELECT-ROUTE-CHAT": selectChatOut });
process.env.FAKE_LLM_FAIL_ON = "FAIL-THIS-TURN";

const arcrc = join(dir, "arcrc");
writeFileSync(arcrc, JSON.stringify({ hosts: { "https://phab.example.com/api/": { token: "test-token" } } }));
process.env.SPATIAL_ARCRC_PATH = arcrc;
type ConduitInline = { revisionID: number; diffID: number; filePath: string; isNewFile: number; lineNumber: number; lineLength: number; content: string };
type ConduitState = { diffs: number[]; transactions: object[]; rawDiffs: Record<number, string>; inlines: ConduitInline[]; title?: string; base?: string; parents?: number[]; closed?: boolean };
const conduitStates = new Map<number, ConduitState>([[1, { diffs: [1], transactions: [], rawDiffs: {}, inlines: [] }]]);
const phidOf = (revision: number) => `PHID-DREV-${revision}`;
const state = (revision: number) => {
  const existing = conduitStates.get(revision);
  if (existing) return existing;
  const created: ConduitState = { diffs: [1], transactions: [], rawDiffs: {}, inlines: [] };
  conduitStates.set(revision, created);
  return created;
};
const stackGraph = (revision: number, graph: Record<string, string[]> = {}) => {
  const parents = state(revision).parents ?? [];
  graph[phidOf(revision)] = parents.map(phidOf);
  for (const parent of parents) stackGraph(parent, graph);
  return graph;
};
let nextInlineId = 1;
const defaultRawDiff = await makeGit(repo.dir).diff(base, head);
const conduit = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.method === "POST" && req.url === "/control") {
    const update = JSON.parse(body || "{}");
    const current = state(update.revision);
    if (update.diffs) current.diffs = update.diffs;
    if (update.transactions) current.transactions = update.transactions;
    if (update.rawDiffs) current.rawDiffs = update.rawDiffs;
    if (update.title !== undefined) current.title = update.title;
    if (update.base !== undefined) current.base = update.base;
    if (update.parents !== undefined) current.parents = update.parents;
    if (update.closed !== undefined) current.closed = update.closed;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/control/inlines")) {
    const revision = Number(new URL(req.url, "http://127.0.0.1").searchParams.get("revision"));
    const inlines = conduitStates.get(revision)?.inlines ?? [];
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(inlines));
    return;
  }
  const form = new URLSearchParams(body);
  const method = req.url!.slice("/api/".length);
  const params = JSON.parse(form.get("params") ?? "{}");
  if (params.__conduit__?.token !== "test-token") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ error_code: "ERR-INVALID-SESSION", error_info: "Session key is not present.", result: null }));
    return;
  }
  const revisionId = Number(params.constraints?.ids?.[0] ?? params.revisionID ?? params.objectIdentifier?.replace("PHID-DREV-", "") ?? params.constraints?.revisionPHIDs?.[0]?.replace("PHID-DREV-", "") ?? 1);
  const conduitState = state(revisionId);
  const result = method === "differential.revision.search" ? (() => {
    const ids: number[] = params.constraints?.ids ?? params.constraints?.phids?.map((phid: string) => Number(phid.replace("PHID-DREV-", ""))) ?? [1];
    return { data: ids.map((id) => {
      const revisionState = state(id);
      return { id, phid: phidOf(id), fields: { title: revisionState.title ?? `Revision ${id}`, status: { value: revisionState.closed ? "published" : "needs-review", closed: revisionState.closed ?? false }, stackGraph: stackGraph(id) } };
    }) };
  })()
    : method === "differential.diff.search" ? { data: conduitState.diffs.map((id) => ({ id, phid: `PHID-DIFF-${id}`, fields: { revisionPHID: phidOf(revisionId), dateCreated: 1_700_000_000, refs: conduitState.base ? [{ type: "base", identifier: conduitState.base }] : [] } })) }
      // `getrawdiff` names no revision; diff ids are unique across revisions, as on Phabricator.
      : method === "differential.getrawdiff" ? [...conduitStates.values()].find((state) => state.rawDiffs[params.diffID])?.rawDiffs[params.diffID] ?? (params.diffID === 1 ? defaultRawDiff : defaultRawDiff.replace("THIRTY", "THIRTY-X"))
          : method === "differential.createinline" ? (() => {
              const inline: ConduitInline = {
                revisionID: Number(params.revisionID),
                diffID: Number(params.diffID),
                filePath: params.filePath,
                isNewFile: Number(params.isNewFile),
                lineNumber: Number(params.lineNumber),
                lineLength: Number(params.lineLength),
                content: params.content,
              };
              conduitState.inlines.push(inline);
              return { id: nextInlineId++ };
            })()
            : method === "transaction.search" ? { data: conduitState.transactions, cursor: { limit: "50", after: null, before: null } }
              : method === "user.whoami" ? { phid: "PHID-USER-me", userName: "me", realName: "Me" }
                : method === "user.search" ? { data: [{ phid: "PHID-USER-alice", fields: { username: "alice", realName: "Alice" } }, { phid: "PHID-USER-reviewbot", fields: { username: "reviewbot", realName: "Code Review Bot" } }] }
          : null;
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ error_code: null, error_info: null, result }));
});
await new Promise<void>((resolve) => conduit.listen(CONDUIT_PORT, "127.0.0.1", resolve));
process.env.SPATIAL_CONDUIT_BASE_URL = `http://127.0.0.1:${CONDUIT_PORT}`;

const rt = createRuntime({ dbPath: join(dir, "db.sqlite"), claudeBin: STUB });
const fixture = await createSession(rt.store, repo.dir, "fixture", null);
const fixtureStart = rt.store.putArtifact<WorkflowStartData>({ sessionId: fixture.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" }, data: { via: "command", workflow: "review", params: { base: "HEAD~1", head: "HEAD", revision: null }, title: "fixture", prompt: "HEAD~1..HEAD" } });
await runWorkflow(rt, fixture.id, fixtureStart.id);
const watcher = new RevisionWatcher(rt, { intervalMs: 300 });
watcher.start();
new PhabricatorSyncer(rt, watcher, { intervalMs: 300 }).start();
createHttpServer(rt, { staticDir: "dist/web", watcher }).listen(PORT, "127.0.0.1", () => console.log(`e2e runtime on ${PORT}`));
