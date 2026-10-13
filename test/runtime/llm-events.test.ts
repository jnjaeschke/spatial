import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_ACTIVITY_TEXT, MAX_COMMAND_OUTPUT, MAX_RESULT_OUTPUT, claudeEventReader, codexEventReader } from "../../src/runtime/llm/events.ts";
import { ClaudeBackend } from "../../src/runtime/llm/claude.ts";
import { CodexBackend } from "../../src/runtime/llm/codex.ts";
import type { LlmEvent } from "../../src/runtime/llm/types.ts";

const STUB = fileURLToPath(new URL("../stubs/fake-llm.mjs", import.meta.url));
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8");
const clock = () => { let t = 1000; return () => (t += 250); };
function read(reader: (line: string) => void, text: string) { for (const line of text.split("\n")) reader(line); }
const describe = (e: LlmEvent) => e.kind === "progress" ? e.message : e.kind === "command" ? `${e.command} -> ${e.exitCode}` : e.kind === "session" ? `session ${e.providerSessionId}` : e.kind === "usage" ? "usage" : "activity";
const activities = (events: LlmEvent[]) => events.flatMap((e) => e.kind === "activity" ? [e.activity] : []);
const said = (events: LlmEvent[]) => activities(events).filter((a) => a.kind !== "tool-result").map((a) => { if (a.kind !== "tool") return a; const { callId: _, ...rest } = a; return rest; });

test("claude stream: progress for shell and edits, command runs with exit codes", () => {
  const events: LlmEvent[] = [];
  read(claudeEventReader((e) => events.push(e), clock()), fixture("claude-stream.jsonl"));
  assert.deepEqual(events.filter((e) => e.kind !== "activity").map(describe), [
    "session 69d98f99-fd06-4274-875f-052ab81441e8", "running git status --short", "running false", "false -> 1", "git status --short -> 0", "editing /tmp/spike-oqAa/a.txt", "usage",
  ]);
  const status = events.find((e) => e.kind === "command" && e.command === "git status --short")!;
  assert.equal(status.kind === "command" && status.output, "?? b.txt\n?? c.txt");
  const failed = events.find((e) => e.kind === "command" && e.command === "false")!;
  assert.equal(failed.kind === "command" && failed.output, "Exit code 1");
  assert.ok(events.every((e) => e.kind !== "command" || e.durationMs > 0));
});

test("codex stream: wrapped commands are unwrapped, error items are ignored", () => {
  const events: LlmEvent[] = [];
  read(codexEventReader((e) => events.push(e), clock()), fixture("codex.jsonl"));
  assert.deepEqual(events.filter((e) => e.kind !== "activity").map(describe), [
    "session 01a11c66-e36a-7fc0-b477-1b34dd2b17a8", "running git status --short", "git status --short -> 0", "running false", "false -> 1", "running printf 'b' > a.txt", "printf 'b' > a.txt -> 0", "usage",
  ]);
  const status = events.find((e) => e.kind === "command")!;
  assert.equal(status.kind === "command" && status.output, "?? b.txt\n?? c.txt\n");
});

test("claude stream: activity is the text and every tool call but the structured answer; empty thinking is skipped", () => {
  const events: LlmEvent[] = [];
  const reader = claudeEventReader((e) => events.push(e), clock());
  read(reader, fixture("claude-stream.jsonl"));
  reader(JSON.stringify({ type: "assistant", message: { content: [{ type: "thinking", thinking: "Check the docs first." }, { type: "tool_use", id: "s", name: "StructuredOutput", input: { a: 1 } }, { type: "tool_use", id: "g", name: "Grep", input: { pattern: "foo\nbar" } }, { type: "tool_use", id: "m", name: "mcp__devtools__snap", input: { n: 2 } }] } }));
  assert.deepEqual(said(events), [
    { kind: "tool", name: "Bash", detail: "git status --short" },
    { kind: "tool", name: "Bash", detail: "false" },
    { kind: "tool", name: "Read", detail: "/tmp/spike-oqAa/a.txt" },
    { kind: "tool", name: "Edit", detail: "/tmp/spike-oqAa/a.txt" },
    { kind: "text", text: "All three steps ran:\n\n1. `git status --short` showed `?? b.txt` and `?? c.txt`.\n2. `false` exited with code 1, as expected.\n3. `a.txt` now contains `b` in place of `a`. It was `a` plus a trailing newline before, and the edit kept the newline." },
    { kind: "thinking", text: "Check the docs first." },
    { kind: "tool", name: "Grep", detail: "foo" },
    { kind: "tool", name: "mcp__devtools__snap", detail: '{"n":2}' },
  ]);
});

test("codex stream: activity is messages, reasoning, commands, file changes, MCP calls and searches", () => {
  const events: LlmEvent[] = [];
  const reader = codexEventReader((e) => events.push(e), clock());
  read(reader, fixture("codex.jsonl"));
  for (const item of [{ type: "reasoning", text: "Look at the tests." }, { type: "file_change", changes: [{ path: "a.txt", kind: "update" }] }, { type: "mcp_tool_call", server: "devtools", tool: "snap", arguments: { n: 2 } }, { type: "web_search", query: "navigation api" }]) reader(JSON.stringify({ type: "item.completed", item: { id: "i", ...item } }));
  const [first, ...rest] = said(events);
  assert.equal(first!.kind === "text" && first!.text.startsWith("I’ll run the commands"), true);
  assert.deepEqual(rest.slice(0, 3), [
    { kind: "tool", name: "shell", detail: "git status --short" },
    { kind: "tool", name: "shell", detail: "false" },
    { kind: "tool", name: "shell", detail: "printf 'b' > a.txt" },
  ]);
  assert.equal(rest[3]!.kind === "text" && rest[3]!.text.startsWith("`git status --short` showed"), true);
  assert.deepEqual(rest.slice(4), [
    { kind: "thinking", text: "Look at the tests." },
    { kind: "tool", name: "edit", detail: "a.txt" },
    { kind: "tool", name: "devtools.snap", detail: '{"n":2}' },
    { kind: "tool", name: "web search", detail: "navigation api" },
  ]);
});

test("activity text is capped", () => {
  const events: LlmEvent[] = [];
  claudeEventReader((e) => events.push(e))(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "x".repeat(MAX_ACTIVITY_TEXT + 10) }] } }));
  const [activity] = activities(events);
  assert.ok(activity!.kind === "text" && activity!.text.length < MAX_ACTIVITY_TEXT + 40);
});

test("claude stream: every tool result pairs with its call by id; only Bash has an exit code", () => {
  const events: LlmEvent[] = [];
  read(claudeEventReader((e) => events.push(e), clock()), fixture("claude-stream.jsonl"));
  const all = activities(events);
  const results = all.filter((a) => a.kind === "tool-result");
  assert.equal(results.length, 4);
  for (const result of results) assert.ok(all.some((a) => a.kind === "tool" && a.callId === result.callId));
  const byCommand = (command: string) => { const call = all.find((a) => a.kind === "tool" && a.detail === command)!; return results.find((r) => r.kind === "tool-result" && call.kind === "tool" && r.callId === call.callId)!; };
  assert.deepEqual(byCommand("false"), { kind: "tool-result", callId: "toolu_01MJfNLddConHauqj5n21Wyw", exitCode: 1, durationMs: 250, output: "Exit code 1" });
  assert.deepEqual(byCommand("git status --short"), { kind: "tool-result", callId: "toolu_01D9UTbeb9wH1a5a7FbiVxtg", exitCode: 0, durationMs: 750, output: "?? b.txt\n?? c.txt" });
  assert.equal(results.filter((r) => r.kind === "tool-result" && r.exitCode === null).length, 2);
});

test("claude stream: a result's output is capped at 16 KB and a structured answer has no result", () => {
  const events: LlmEvent[] = [];
  const reader = claudeEventReader((e) => events.push(e), clock());
  reader(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "g", name: "Grep", input: { pattern: "x" } }, { type: "tool_use", id: "s", name: "StructuredOutput", input: {} }] } }));
  reader(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "g", content: [{ type: "text", text: "y".repeat(MAX_RESULT_OUTPUT + 10) }] }, { type: "tool_result", tool_use_id: "s", content: "ok" }] } }));
  const results = activities(events).filter((a) => a.kind === "tool-result");
  assert.equal(results.length, 1);
  const out = results[0]!.kind === "tool-result" ? results[0]!.output : "";
  assert.ok(out.length < MAX_RESULT_OUTPUT + 40);
  assert.ok(out.endsWith("[output truncated]"));
});

test("codex stream: command and MCP results pair with their calls", () => {
  const events: LlmEvent[] = [];
  const reader = codexEventReader((e) => events.push(e), clock());
  read(reader, fixture("codex.jsonl"));
  reader(JSON.stringify({ type: "item.started", item: { id: "m1", type: "mcp_tool_call", server: "devtools", tool: "snap", arguments: {} } }));
  reader(JSON.stringify({ type: "item.completed", item: { id: "m1", type: "mcp_tool_call", server: "devtools", tool: "snap", arguments: {}, result: { content: [{ type: "text", text: "a page" }] } } }));
  const all = activities(events);
  const results = all.filter((a) => a.kind === "tool-result");
  assert.deepEqual(results.map((r) => r.kind === "tool-result" && [r.callId, r.exitCode]), [["item_3", 0], ["item_4", 1], ["item_5", 0], ["m1", null]]);
  const call = all.find((a) => a.kind === "tool" && a.name === "devtools.snap")!;
  assert.equal(call.kind === "tool" && call.callId, "m1");
  const mcp = results.at(-1)!;
  assert.equal(mcp.kind === "tool-result" && mcp.output, "a page");
  assert.equal(mcp.kind === "tool-result" && mcp.durationMs, 250);
  const shell = results[0]!;
  assert.equal(shell.kind === "tool-result" && shell.output, "?? b.txt\n?? c.txt\n");
  assert.ok(events.filter((e) => e.kind === "command").every((e) => e.kind === "command" && e.callId?.startsWith("item_")));
});

test("codex stream: with a schema the turn's last agent message is the answer, not activity", () => {
  const lines = [
    { type: "item.completed", item: { id: "a", type: "agent_message", text: "Looking at the frame code." } },
    { type: "item.started", item: { id: "c", type: "command_execution", command: "ls" } },
    { type: "item.completed", item: { id: "b", type: "agent_message", text: "{\"answer\":\"done\"}" } },
    { type: "turn.completed", usage: {} },
  ].map((line) => JSON.stringify(line));
  const texts = (structured: boolean) => {
    const events: LlmEvent[] = [];
    const reader = codexEventReader((e) => events.push(e), clock(), structured);
    for (const line of lines) reader(line);
    return activities(events).flatMap((a) => a.kind === "text" ? [a.text] : []);
  };
  assert.deepEqual(texts(true), ["Looking at the frame code."]);
  assert.deepEqual(texts(false), ["Looking at the frame code.", "{\"answer\":\"done\"}"]);
});

test("claude stream: each result reports the run's usage so far, its tokens summed over the results and the cost as claude totals it", () => {
  const events: LlmEvent[] = [];
  const reader = claudeEventReader((e) => events.push(e));
  reader(JSON.stringify({ type: "result", subtype: "success", session_id: "s", total_cost_usd: 0.1, usage: { input_tokens: 2, cache_creation_input_tokens: 3, cache_read_input_tokens: 5, output_tokens: 7 } }));
  reader(JSON.stringify({ type: "result", subtype: "error_during_execution", session_id: "s", total_cost_usd: 0.25, usage: { input_tokens: 1, cache_read_input_tokens: 10, output_tokens: 4 } }));
  assert.deepEqual(events.filter((e) => e.kind === "usage"), [
    { kind: "usage", usage: { inputTokens: 10, cachedInputTokens: 5, outputTokens: 7, costUsd: 0.1, cumulative: false } },
    { kind: "usage", usage: { inputTokens: 21, cachedInputTokens: 15, outputTokens: 11, costUsd: 0.25, cumulative: false } },
  ]);
});

test("codex stream: a completed turn reports the provider session's cumulative usage", () => {
  const events: LlmEvent[] = [];
  codexEventReader((e) => events.push(e))(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 20, cached_input_tokens: 15, output_tokens: 4 } }));
  assert.deepEqual(events, [{ kind: "usage", usage: { inputTokens: 20, cachedInputTokens: 15, outputTokens: 4, cumulative: true } }]);
});

test("an MCP call's detail names what it works on, like a Claude tool", () => {
  const events: LlmEvent[] = [];
  codexEventReader((e) => events.push(e))(JSON.stringify({ type: "item.completed", item: { id: "m", type: "mcp_tool_call", server: "spatial", tool: "scm_file", arguments: { rev: "9143bdf", path: "layout/generic/nsIFrame.cpp", start: 2350, end: 2505 }, result: { content: [] } } }));
  const call = activities(events).find((a) => a.kind === "tool")!;
  assert.equal(call.kind === "tool" && call.detail, "layout/generic/nsIFrame.cpp");
});

test("codex result output is capped at 16 KB", () => {
  const events: LlmEvent[] = [];
  codexEventReader((e) => events.push(e))(JSON.stringify({ type: "item.completed", item: { id: "x", type: "command_execution", command: "yes", aggregated_output: "y".repeat(MAX_RESULT_OUTPUT + 10), exit_code: 0, status: "completed" } }));
  const result = activities(events).find((a) => a.kind === "tool-result")!;
  assert.ok(result.kind === "tool-result" && result.output.length < MAX_RESULT_OUTPUT + 40 && result.output.endsWith("[output truncated]"));
});

test("readers report the provider session id from the first event that shows it", () => {
  const claude: LlmEvent[] = [];
  const claudeReader = claudeEventReader((e) => claude.push(e));
  claudeReader(JSON.stringify({ type: "system", subtype: "init", session_id: "c-1" }));
  claudeReader(JSON.stringify({ type: "system", subtype: "thinking_tokens", session_id: "c-1" }));
  assert.deepEqual(claude, [{ kind: "session", providerSessionId: "c-1" }]);
  const codex: LlmEvent[] = [];
  const codexReader = codexEventReader((e) => codex.push(e));
  codexReader(JSON.stringify({ type: "thread.started", thread_id: "t-1" }));
  codexReader(JSON.stringify({ type: "turn.started" }));
  assert.deepEqual(codex, [{ kind: "session", providerSessionId: "t-1" }]);
});

test("command output is capped", () => {
  const events: LlmEvent[] = [];
  const line = JSON.stringify({ type: "item.completed", item: { id: "x", type: "command_execution", command: "yes", aggregated_output: "y".repeat(MAX_COMMAND_OUTPUT + 10), exit_code: 0, status: "completed" } });
  codexEventReader((e) => events.push(e))(line);
  const command = events.find((e) => e.kind === "command");
  const out = command?.kind === "command" ? command.output : "";
  assert.ok(out.length < MAX_COMMAND_OUTPUT + 40);
  assert.ok(out.endsWith("[output truncated]"));
});

test("readers ignore lines that are not JSON events", () => {
  const events: LlmEvent[] = [];
  const reader = codexEventReader((e) => events.push(e));
  for (const line of ["Reading additional input from stdin...", "", "{broken", JSON.stringify({ type: "turn.started" })]) reader(line);
  assert.deepEqual(events, []);
});

test("read-only runs stream activity too", async () => {
  const dir = mkdtempSync(join(tmpdir(), "events-"));
  for (const [Backend, name] of [[ClaudeBackend, "claude-stream.jsonl"], [CodexBackend, "codex.jsonl"]] as const) {
    const out = join(dir, name);
    writeFileSync(out, fixture(name));
    process.env.FAKE_LLM_STDOUT = out;
    const events: LlmEvent[] = [];
    await new Backend({ bin: STUB }).run({ prompt: "p", model: "m", effort: "low", tools: "read-only", signal: new AbortController().signal, onEvent: (e) => events.push(e) });
    assert.ok(activities(events).some((a) => a.kind === "text"), name);
  }
});

test("backends stream events to onEvent in write mode", async () => {
  const dir = mkdtempSync(join(tmpdir(), "events-"));
  process.env.FAKE_LLM_LOG = join(dir, "log.jsonl");
  const claudeOut = join(dir, "claude.jsonl");
  writeFileSync(claudeOut, fixture("claude-stream.jsonl"));
  process.env.FAKE_LLM_STDOUT = claudeOut;
  const claudeEvents: LlmEvent[] = [];
  const claude = await new ClaudeBackend({ bin: STUB }).run({ prompt: "p", model: "m", effort: "low", tools: "write", signal: new AbortController().signal, onEvent: (e) => claudeEvents.push(e) });
  assert.equal(claude.providerSessionId, "69d98f99-fd06-4274-875f-052ab81441e8");
  assert.equal(claudeEvents.filter((e) => e.kind === "command").length, 2);
  const codexOut = join(dir, "codex.jsonl");
  writeFileSync(codexOut, fixture("codex.jsonl"));
  process.env.FAKE_LLM_STDOUT = codexOut;
  const codexEvents: LlmEvent[] = [];
  const codex = await new CodexBackend({ bin: STUB }).run({ prompt: "p", model: "m", effort: "low", tools: "write", signal: new AbortController().signal, onEvent: (e) => codexEvents.push(e) });
  assert.equal(codex.providerSessionId, "01a11c66-e36a-7fc0-b477-1b34dd2b17a8");
  assert.equal(codexEvents.filter((e) => e.kind === "command").length, 3);
});
