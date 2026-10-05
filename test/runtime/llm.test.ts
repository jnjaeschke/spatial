import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeBackend } from "../../src/runtime/llm/claude.ts";
import { CodexBackend } from "../../src/runtime/llm/codex.ts";
import { LlmManager } from "../../src/runtime/llm/manager.ts";
import { runProcess } from "../../src/runtime/llm/process.ts";
import type { LlmBackend, LlmRequest } from "../../src/runtime/llm/types.ts";

const STUB = fileURLToPath(new URL("../stubs/fake-llm.mjs", import.meta.url));
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "llm-"));
  process.env.FAKE_LLM_LOG = join(dir, "log.jsonl");
  delete process.env.FAKE_LLM_STDOUT;
  delete process.env.FAKE_LLM_EXIT;
  delete process.env.FAKE_LLM_SLEEP_MS;
  delete process.env.FAKE_LLM_STDERR;
});

function stdout(s: string) {
  const p = join(dir, "out");
  writeFileSync(p, s);
  process.env.FAKE_LLM_STDOUT = p;
}
const calls = () => readFileSync(process.env.FAKE_LLM_LOG!, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const req = (over: Partial<LlmRequest> = {}): LlmRequest => ({
  prompt: "PROMPT", model: "m1", effort: "high", tools: "none", signal: new AbortController().signal, ...over,
});
const SCHEMA = { type: "object", additionalProperties: false, required: ["n"], properties: { n: { type: "integer" } } };

test("runProcess: abort kills the child and rejects", async () => {
  process.env.FAKE_LLM_SLEEP_MS = "10000";
  const c = new AbortController();
  const p = runProcess(STUB, [], { stdin: "", signal: c.signal });
  setTimeout(() => c.abort(), 50);
  const t0 = Date.now();
  await assert.rejects(p, /aborted/i);
  assert.ok(Date.now() - t0 < 5000);
});

test("runProcess: missing binary gives a clear error", async () => {
  await assert.rejects(runProcess("/nonexistent/claude", [], { stdin: "", signal: new AbortController().signal }), /Cannot run \/nonexistent\/claude/);
});

test("claude: args, stdin prompt, structured output, usage", async () => {
  stdout(JSON.stringify({ type: "result", is_error: false, result: '{"n":7}', structured_output: { n: 7 }, session_id: "sess-1", total_cost_usd: 0.5, usage: { input_tokens: 10, output_tokens: 3 } }));
  const r = await new ClaudeBackend({ bin: STUB }).run(req({ system: "SYS", schema: SCHEMA, cwd: dir }));
  assert.deepEqual(r, { text: '{"n":7}', json: { n: 7 }, providerSessionId: "sess-1", usage: { inputTokens: 10, outputTokens: 3, costUsd: 0.5 } });
  const [call] = calls();
  assert.equal(call.stdin, "PROMPT");
  assert.equal(call.cwd, dir);
  const a: string[] = call.argv;
  assert.deepEqual(a.slice(0, 3), ["-p", "--output-format", "json"]);
  const flag = (f: string) => a[a.indexOf(f) + 1];
  assert.equal(flag("--model"), "m1");
  assert.equal(flag("--effort"), "high");
  assert.equal(flag("--setting-sources"), "");
  assert.equal(flag("--tools"), "");
  assert.equal(flag("--system-prompt"), "SYS");
  assert.deepEqual(JSON.parse(flag("--json-schema")), SCHEMA);
  assert.ok(!a.includes("PROMPT"));
});

test("claude: read-only tools", async () => {
  stdout(JSON.stringify({ type: "result", is_error: false, result: "hi", session_id: "s", usage: { input_tokens: 1, output_tokens: 1 } }));
  await new ClaudeBackend({ bin: STUB }).run(req({ tools: "read-only" }));
  const a: string[] = calls()[0].argv;
  assert.equal(a[a.indexOf("--tools") + 1], "Read,Grep,Glob");
});

test("claude: is_error surfaces the result text", async () => {
  stdout(JSON.stringify({ type: "result", is_error: true, result: "Invalid model: m1", session_id: "s" }));
  process.env.FAKE_LLM_EXIT = "1";
  await assert.rejects(new ClaudeBackend({ bin: STUB }).run(req()), /claude: Invalid model: m1/);
});

test("claude: nonzero exit with non-JSON output surfaces stderr", async () => {
  stdout("not json");
  process.env.FAKE_LLM_EXIT = "2";
  process.env.FAKE_LLM_STDERR = "please log in";
  await assert.rejects(new ClaudeBackend({ bin: STUB }).run(req()), /claude exited with code 2: please log in/);
});

test("claude: schema requested but no structured_output", async () => {
  stdout(JSON.stringify({ type: "result", is_error: false, result: "oops", session_id: "s", usage: { input_tokens: 1, output_tokens: 1 } }));
  await assert.rejects(new ClaudeBackend({ bin: STUB }).run(req({ schema: SCHEMA })), /no structured_output/);
});

test("claude: static model list", async () => {
  const models = await new ClaudeBackend({ bin: STUB }).listModels();
  assert.deepEqual(models.map((m) => m.id), ["opus", "sonnet", "haiku"]);
  assert.deepEqual(models[0].efforts, ["low", "medium", "high", "xhigh", "max"]);
});

const codexOut = (text: string) =>
  [
    { type: "thread.started", thread_id: "th-1" },
    { type: "turn.started" },
    { type: "item.completed", item: { id: "i0", type: "reasoning", text: "thinking" } },
    { type: "item.completed", item: { id: "i1", type: "agent_message", text } },
    { type: "turn.completed", usage: { input_tokens: 20, output_tokens: 4 } },
  ].map((e) => JSON.stringify(e)).join("\n") + "\n";

test("codex: args, system prepended, schema file, parsed JSON", async () => {
  stdout(codexOut('{"n":7}'));
  const r = await new CodexBackend({ bin: STUB }).run(req({ system: "SYS", schema: SCHEMA, cwd: dir }));
  assert.deepEqual(r, { text: '{"n":7}', json: { n: 7 }, providerSessionId: "th-1", usage: { inputTokens: 20, outputTokens: 4 } });
  const [call] = calls();
  assert.equal(call.stdin, "SYS\n\nPROMPT");
  const a: string[] = call.argv;
  assert.deepEqual(a.slice(0, 4), ["exec", "--json", "--skip-git-repo-check", "--ignore-user-config"]);
  const flag = (f: string) => a[a.indexOf(f) + 1];
  assert.equal(flag("-m"), "m1");
  assert.equal(flag("-c"), "model_reasoning_effort=high");
  assert.equal(flag("--sandbox"), "read-only");
  assert.equal(flag("-C"), dir);
  assert.ok(flag("--output-schema").endsWith(".json"));
});

test("codex: turn.failed surfaces the error message", async () => {
  stdout([JSON.stringify({ type: "thread.started", thread_id: "t" }), JSON.stringify({ type: "turn.failed", error: { message: "model not found" } })].join("\n"));
  process.env.FAKE_LLM_EXIT = "1";
  await assert.rejects(new CodexBackend({ bin: STUB }).run(req()), /codex: model not found/);
});

test("codex: non-JSON agent message with schema is an error", async () => {
  stdout(codexOut("sorry, no"));
  await assert.rejects(new CodexBackend({ bin: STUB }).run(req({ schema: SCHEMA })), /codex returned invalid JSON/);
});

test("codex: models from models_cache.json; missing file is an error", async () => {
  const home = join(dir, "codex-home");
  mkdirSync(home);
  writeFileSync(join(home, "models_cache.json"), JSON.stringify({ models: [
    { slug: "gpt-6-luna", visibility: "list", supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }] },
    { slug: "hidden", visibility: "hide", supported_reasoning_levels: [] },
  ] }));
  assert.deepEqual(await new CodexBackend({ bin: STUB, codexHome: home }).listModels(), [{ id: "gpt-6-luna", efforts: ["low", "high"] }]);
  await assert.rejects(new CodexBackend({ bin: STUB, codexHome: join(dir, "none") }).listModels(), /Cannot read codex model list/);
});

test("manager: default vs explicit selection, unknown backend", async () => {
  const seen: LlmRequest[] = [];
  const fake = (id: "claude" | "codex"): LlmBackend => ({
    id,
    async listModels() { return [{ id: `${id}-m`, efforts: ["low"] }]; },
    async run(r) { seen.push(r); return { text: id, providerSessionId: "x" }; },
  });
  const m = new LlmManager([fake("claude"), fake("codex")], { backend: "claude", model: "sonnet", effort: "medium" });
  const signal = new AbortController().signal;
  const r1 = await m.run(undefined, { prompt: "p", tools: "none" }, signal);
  assert.equal(r1.text, "claude");
  assert.deepEqual(r1.selection, { backend: "claude", model: "sonnet", effort: "medium" });
  assert.equal(seen[0].model, "sonnet");
  assert.equal(seen[0].signal, signal);
  const r2 = await m.run({ backend: "codex", model: "gpt-6-luna", effort: "low" }, { prompt: "p", tools: "none" }, signal);
  assert.equal(r2.text, "codex");
  assert.deepEqual(await m.listModels(), { claude: [{ id: "claude-m", efforts: ["low"] }], codex: [{ id: "codex-m", efforts: ["low"] }] });
  const only = new LlmManager([fake("claude")], { backend: "claude", model: "s", effort: "low" });
  await assert.rejects(only.run({ backend: "codex", model: "x", effort: "low" }, { prompt: "p", tools: "none" }, signal), /Unknown LLM backend: codex/);
});
