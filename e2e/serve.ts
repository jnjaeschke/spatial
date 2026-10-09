import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../src/runtime/create.ts";
import { createSession, makeGit } from "../src/runtime/git.ts";
import type { WorkflowStartData } from "../src/shared/types.ts";
import { runWorkflow } from "../src/workflows/start.ts";
import { createHttpServer } from "../src/server/http.ts";
import { makeRepo } from "../test/helpers/git-fixture.ts";

const PORT = Number(process.env.E2E_PORT ?? 4178);
const CONDUIT_PORT = Number(process.env.E2E_CONDUIT_PORT ?? 4179);
const STUB = fileURLToPath(new URL("../test/stubs/fake-llm.mjs", import.meta.url));
const WEBSPEC = fileURLToPath(new URL("../test/stubs/fake-webspec.mjs", import.meta.url));
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
writeFileSync(chatOut, JSON.stringify({ type: "result", is_error: false, result: chatAnswer, structured_output: { answer: chatAnswer, questions: ["Should c2 really depend on c1?"], revisions: [], requestMcpServers: [], diagram: null }, session_id: "stub-chat", usage: { input_tokens: 1, output_tokens: 1 } }));
const selectReviewOut = join(dir, "select-review.json");
writeFileSync(selectReviewOut, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { workflow: "review", params: { base: null, head: null, revision: null }, title: "Review via selector" }, session_id: "stub-select-review", usage: { input_tokens: 1, output_tokens: 1 } }));
const selectChatOut = join(dir, "select-chat.json");
const selectAskOut = join(dir, "select-ask.json");
writeFileSync(selectAskOut, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { question: "Review your branch or chat about it?", workflow: "chat", params: {}, title: "Unsure" }, session_id: "stub-select-ask", usage: { input_tokens: 1, output_tokens: 1 } }));
writeFileSync(selectChatOut, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { workflow: "chat", params: {}, title: "Chat via selector" }, session_id: "stub-select-chat", usage: { input_tokens: 1, output_tokens: 1 } }));
const mcpRequestOut = join(dir, "mcp-request.json");
writeFileSync(mcpRequestOut, JSON.stringify({ type: "result", is_error: false, result: chatAnswer, structured_output: { answer: chatAnswer, questions: [], revisions: [], requestMcpServers: ["firefox-devtools"], diagram: null }, session_id: "stub-chat", usage: { input_tokens: 1, output_tokens: 1 } }));
const revisedOut = join(dir, "revised-chat.json");
writeFileSync(revisedOut, JSON.stringify({ type: "result", is_error: false, result: "You are right, corrected.", structured_output: { answer: "You are right, corrected.", questions: [], revisions: [{ message: null, quote: "Stub answer.", correction: "Corrected stub answer." }], requestMcpServers: [], diagram: null }, session_id: "stub-chat", usage: { input_tokens: 1, output_tokens: 1 } }));
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
const diagramOut = stubOut("diagram", { answer: "Here is the sequence.", questions: [], revisions: [], requestMcpServers: [], diagram: { commit: 1, title: "First commit sequence", summary: "The changed value is applied, then observed.", lanes: [
  { id: "driver", label: "Refresh driver", note: null }, { id: "page", label: "Page", note: "current document" }, { id: "object", label: "Target object", note: null },
], steps: [
  { from: "driver", to: "page", symbol: "c", call: "Apply(c)", what: "Applies the changed value.", when: "During refresh", guard: "if current", phase: "Refresh", status: "changed", cite: { path: "c.txt", line: 1 } },
  { from: "page", to: "object", symbol: "NOPE", call: "Notify()", what: "Notifies the object.", when: null, guard: null, phase: "Refresh", status: "new", cite: { path: "a.txt", line: 999 } },
  { from: "object", to: "object", symbol: "line", call: "Render()", what: "Renders the result.", when: "Before the next paint", guard: null, phase: "Paint", status: "existing", cite: { path: "a.txt", line: 1 } },
], before: [{ from: "driver", to: "page", symbol: "line", call: "Render()", what: "Rendered the old value.", when: null, guard: null, phase: "Refresh", status: "removed", cite: { path: "a.txt", line: 1 } }] } });
const stackRewriteOut = stubOut("stack-rewrite", { summary: "Edits `a.txt` and adds `c.txt`, then rewrites line 30 again.", commitIntents: ["Replaces `line 30` and adds `c.txt`.", "Rewrites line 30 a second time."], flowHints: ["how the changed value is applied", null], changes: [
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
const specNarrativeOut = stubOut("spec-narrative", { summary: "Implements navigate.", changes: [{ id: "c1", title: "Implement navigate", explanation: "Edits and adds.", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] }] });
const specMapOut = stubOut("spec-map", { links: [
  { step: "1", kind: "implements", ranges: [{ path: "SpecViewFixture.cpp", side: "new", start: 3, end: 4 }], note: "Edits the line." },
  { step: "2", kind: "deviates", ranges: [{ path: "SpecViewFixture.cpp", side: "new", start: 6, end: 6 }], note: "Calls Other() instead of adding the file." },
  { step: "2", kind: "implements", ranges: [{ path: "SpecViewFixture.cpp", side: "new", start: 8, end: 8 }], note: "Adds the file." },
], unmapped: [{ ranges: [{ path: "SpecViewFixture.cpp", side: "new", start: 9, end: 9 }], reason: "plumbing", note: "Logs the navigation." }] });
const fileNavOut = stubOut("file-nav-narrative", { summary: "Edits two places.", changes: [{ id: "c1", title: "Edit two places", explanation: "Edits lines 20, 22 and 150.", rationale: "r", hunkIds: ["f0h0", "f0h1"], dependsOn: [], specUrls: [] }] });
const implementDir = join(dir, "implement");
mkdirSync(implementDir);
const script = (name: string, body: string) => { const file = join(implementDir, `${name}.sh`); writeFileSync(file, body); return file; };
const commit = "git -c user.name=T -c user.email=t@t -c commit.gpgsign=false commit -q";
const implOne = script("one", `sed -i 's/^line 30$/THIRTY/' a.txt\nprintf 'c\\n' > c.txt\ngit add -A\n${commit} -m 'Fix the c thing'\n`);
const implFix = script("fix", `printf 'd\\n' > d.txt\ngit add -A\n${commit} --amend --no-edit\n`);
const implRevise = script("revise", `sed -i 's/^line 31$/THIRTY-ONE/' a.txt\ngit add -A\n${commit} --amend --no-edit\n`);
const investigationOut = stubOut("implement-investigation", { kind: "bugfix", summary: "The c file is missing.", bug: null, locations: [
  { path: "a.txt", line: 30, quote: "line 30", why: "The value to change." }, { path: "gone.txt", line: 1, quote: "x", why: "Does not exist." },
], testCases: [{ description: "c exists", expected: "c.txt exists", actual: null, path: null }], architecture: null,
steps: [{ title: "Add c", message: "Fix the c thing", intent: "Add c.txt and set line 30.", tests: [] }], openQuestions: ["Should d exist too?"], exploration: [{ tried: "grep for c", outcome: "no c.txt exists" }], specUrls: [], diagram: null });
const agentEvents = [
  { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "tu1", name: "Bash", input: { command: "echo hello-from-agent" } }] } },
  { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu1", content: "hello-from-agent\n", is_error: false }] } },
  { type: "result", is_error: false, result: "", structured_output: { summary: "Implemented the plan.", planChange: null, planInvalid: null, step: null }, session_id: "stub-implement", usage: { input_tokens: 1, output_tokens: 1 } },
];
const agentOut = join(implementDir, "agent.jsonl");
writeFileSync(agentOut, agentEvents.map((event) => JSON.stringify(event)).join("\n") + "\n");
const highReviewOut = stubOut("implement-high-review", { findings: [{ anchor: "f0h0", quote: "THIRTY", category: "correctness", severity: "high", title: "Magic value", body: "`THIRTY` needs a name." }], verdicts: [] });
const fixedReviewOut = stubOut("implement-fixed-review", { findings: [], verdicts: [{ finding: "F1", verdict: "addressed", reason: "The value is named." }] });
const tryInvestigationOut = stubOut("try-investigation", { kind: "bugfix", summary: "Gecko needs c.", bug: 4242, locations: [{ path: "a.txt", line: 1, quote: "line 1", why: "Start here." }], testCases: [], architecture: null, steps: [{ title: "Add c", message: "Bug N - Add c", intent: "Add c.txt.", tests: [] }], openQuestions: [], exploration: [], specUrls: [], diagram: null });
const tryCleanReviewOut = stubOut("try-clean-review", { findings: [], verdicts: [] });
const tryProposalOut = stubOut("try-proposal", { command: "./mach try fuzzy --query 'mochitest-plain'", reason: "Runs the plain mochitests." });
const tryChatOut = stubOut("try-chat", { answer: "I will start a try push.", questions: [], revisions: [], requestMcpServers: [], diagram: null, tryPush: { command: "./mach try auto", reason: "You asked for try." } });
const tryNarrativeOut = stubOut("try-narrative", { summary: "Adds c.", changes: [{ id: "c1", title: "Add c", explanation: "Adds c.txt.", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] }] });
const tryImpl = script("try-impl", `printf 'c\\n' > c.txt\ngit add -A\n${commit} -m 'Bug 4242 - Add c'\n`);
const treeherderCli = join(implementDir, "treeherder-cli.sh");
writeFileSync(treeherderCli, `#!/bin/sh\ncat <<'EOF'\n${JSON.stringify({ revision: "abc123", push_id: 7, matched_jobs: 3, jobs: [{ job: { id: 9, job_type_name: "test-linux1804-64/opt-mochitest-plain-1", job_type_symbol: "1", platform: "linux1804-64", platform_option: "opt", result: "testfailed", state: "completed", failure_classification_id: 1 }, errors: [{ action: "test_result", line: 1, test: "dom/base/test/test_c.html", status: "FAIL", message: "c is missing" }], log_matches: [] }] })}\nEOF\n`);
chmodSync(treeherderCli, 0o755);
process.env.SPATIAL_TREEHERDER_CLI = treeherderCli;
const mozPhab = join(implementDir, "moz-phab.sh");
writeFileSync(mozPhab, `#!/bin/sh\nprintf '%s\\n' "$@" > .git/moz-phab-args\ngit -c user.name=spatial -c user.email=spatial@example.com -c commit.gpgsign=false commit -q --amend -m "$(git log -1 --format=%B)" -m "Differential Revision: https://phab.example.com/D4242"\necho "Submitted D4242"\n`);
chmodSync(mozPhab, 0o755);
process.env.SPATIAL_MOZPHAB = mozPhab;
// Implement routes come first: the review prompts of an implement session also contain the generic needles below.
const reviewerInterpretOut = stubOut("reviewer-comment-interpretation", { comments: [{ phid: "PHID-XCMT-4301", asks: "Name the magic value", proposal: "Use a named constant in c.txt", action: "address", reply: null }, { phid: "PHID-XCMT-4302", asks: "Why a new file?", proposal: "None", action: "reply", reply: "A new file keeps the change small." }] });
const reviewerAddress = script("reviewer-address", `printf 'kept\\n' >> c.txt\ngit add -A\n${commit} --amend --no-edit\n`);
const implementRoutes = { "You interpret reviewer comments": reviewerInterpretOut, "You investigate a bug report&&TRY-E2E": tryInvestigationOut, 'TRY-E2E&&"findings"': tryCleanReviewOut, "You propose a try push": tryProposalOut, "You investigate a bug report": investigationOut, "You implement a planned code change": agentOut, "IMPL-E2E&&# Prior findings\n\nF1 [": fixedReviewOut, 'IMPL-E2E&&"findings"': highReviewOut };
// Spec view and file navigation routes come first: their mapping and narration prompts also contain the generic needles below.
process.env.FAKE_LLM_ROUTES = JSON.stringify({ ...implementRoutes, "PUSH-TRY-PLEASE": tryChatOut, "# Spec: HTML#navigate": specMapOut, 'Bug 4242 - Add c&&"findings"': tryCleanReviewOut, 'Bug 1 - Add c&&"findings"': tryCleanReviewOut, 'Address these reviewer comments&&"findings"': tryCleanReviewOut, "Bug 4242 - Add c&&### f0h0 c.txt (added)": tryNarrativeOut, "Bug 1 - Add c&&### f0h0 c.txt (added)": tryNarrativeOut, "# Hunks\n\n### f0h0 SpecViewFixture.cpp": specNarrativeOut, "# Hunks\n\n### f0h0 FileNav.txt": fileNavOut, "# Previous narrative": updateNarrateOut, "c.txt (added) [C1]": stackRewriteOut, "c.txt (added) [C2]": stackAddOut, "# Hunks": out, "# Prior findings\n\nF1 [": updateReviewOut, "Write a review comment as a human reviewer would.": commentOut, "ROUTE-UPDATE-REVIEW": updateReview1Out, '"findings"': reviewOut, "THAT IS WRONG": revisedOut, "ENABLE-DEVTOOLS-PLEASE": mcpRequestOut, "DIAGRAM-PLEASE": diagramOut, "Draw a sequence diagram of": diagramOut, '"revisions"': chatOut, "SELECT-ROUTE-REVIEW": selectReviewOut, "SELECT-ROUTE-CHAT": selectChatOut, "Answer: just chat": selectChatOut, "SELECT-ROUTE-ASK": selectAskOut });
process.env.FAKE_LLM_ACTIONS = JSON.stringify({
  "You implement a planned code change&&Address these reviewer comments": reviewerAddress,
  "You implement a planned code change&&Bug 4242": tryImpl,
  "You implement a planned code change&&# Revision request": implRevise,
  "You implement a planned code change&&# Findings to fix": implFix,
  "You implement a planned code change": implOne,
});
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

const TREEHERDER_PORT = Number(process.env.E2E_TREEHERDER_PORT ?? 4180);
let statusCalls = 0;
const treeherder = createServer((req, res) => {
  if (!/^\/api\/project\/try\/push\/\d+\/status\/$/.test(req.url ?? "")) { res.writeHead(404).end(); return; }
  const done = ++statusCalls > 2;
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(done ? { completed: 3, pending: 0, running: 0, success: 2, testfailed: 1 } : { completed: 1, pending: 1, running: 1, testfailed: 1 }));
});
await new Promise<void>((resolve) => treeherder.listen(TREEHERDER_PORT, "127.0.0.1", resolve));
process.env.SPATIAL_TREEHERDER_URL = `http://127.0.0.1:${TREEHERDER_PORT}`;

const rt = createRuntime({ dbPath: join(dir, "db.sqlite"), claudeBin: STUB, webspecBin: WEBSPEC });
const fixture = await createSession(rt.store, repo.dir, "fixture", null);
const fixtureStart = rt.store.putArtifact<WorkflowStartData>({ sessionId: fixture.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" }, data: { via: "command", workflow: "review", params: { base: "HEAD~1", head: "HEAD", revision: null }, title: "fixture", prompt: "HEAD~1..HEAD" } });
await runWorkflow(rt, fixture.id, fixtureStart.id);
createHttpServer(rt, { staticDir: "dist/web", background: { intervalMs: 300 } }).listen(PORT, "127.0.0.1", () => console.log(`e2e runtime on ${PORT}`));
