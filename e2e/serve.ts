import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../src/runtime/create.ts";
import { createSession } from "../src/runtime/git.ts";
import { createHttpServer } from "../src/server/http.ts";
import { makeRepo } from "../test/helpers/git-fixture.ts";

const STUB = fileURLToPath(new URL("../test/stubs/fake-llm.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "e2e-"));
const repo = makeRepo();
const baseLines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
repo.commit({ "a.txt": `${baseLines.join("\n")}\n`, ".mcp.json": JSON.stringify({ mcpServers: { "firefox-devtools": { type: "stdio", command: "node", args: ["server.js"] } } }) }, "base");
baseLines[29] = "THIRTY";
repo.commit({ "a.txt": `${baseLines.join("\n")}\n`, "c.txt": "c\n" }, "Bug 1 - Change things");

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
const mcpRequestOut = join(dir, "mcp-request.json");
writeFileSync(mcpRequestOut, JSON.stringify({ type: "result", is_error: false, result: chatAnswer, structured_output: { answer: chatAnswer, questions: [], revisions: [], requestMcpServers: ["firefox-devtools"] }, session_id: "stub-chat", usage: { input_tokens: 1, output_tokens: 1 } }));
const revisedOut = join(dir, "revised-chat.json");
writeFileSync(revisedOut, JSON.stringify({ type: "result", is_error: false, result: "You are right, corrected.", structured_output: { answer: "You are right, corrected.", questions: [], revisions: [{ message: null, quote: "Stub answer.", correction: "Corrected stub answer." }], requestMcpServers: [] }, session_id: "stub-chat", usage: { input_tokens: 1, output_tokens: 1 } }));
const reviewOut = join(dir, "review.json");
writeFileSync(reviewOut, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { findings: [{ anchor: "f1h0", quote: "c", category: "tests", severity: "medium", title: "No test for c", body: "Adds `c.txt` without a test." }] }, session_id: "stub-review", usage: { input_tokens: 1, output_tokens: 1 } }));
process.env.FAKE_LLM_ROUTES = JSON.stringify({ '"findings"': reviewOut, "THAT IS WRONG": revisedOut, "ENABLE-DEVTOOLS-PLEASE": mcpRequestOut, '"revisions"': chatOut });
process.env.FAKE_LLM_FAIL_ON = "FAIL-THIS-TURN";

const rt = createRuntime({ dbPath: join(dir, "db.sqlite"), claudeBin: STUB });
await createSession(rt.store, repo.dir, "fixture");
createHttpServer(rt, { staticDir: "dist/web" }).listen(4178, "127.0.0.1", () => console.log("e2e runtime on 4178"));
