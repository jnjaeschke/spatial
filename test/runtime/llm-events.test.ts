import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_COMMAND_OUTPUT, claudeEventReader, codexEventReader } from "../../src/runtime/llm/events.ts";
import { ClaudeBackend } from "../../src/runtime/llm/claude.ts";
import { CodexBackend } from "../../src/runtime/llm/codex.ts";
import type { LlmEvent } from "../../src/runtime/llm/types.ts";

const STUB = fileURLToPath(new URL("../stubs/fake-llm.mjs", import.meta.url));
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8");
const clock = () => { let t = 1000; return () => (t += 250); };
function read(reader: (line: string) => void, text: string) { for (const line of text.split("\n")) reader(line); }

test("claude stream: progress for shell and edits, command runs with exit codes", () => {
  const events: LlmEvent[] = [];
  read(claudeEventReader((e) => events.push(e), clock()), fixture("claude-stream.jsonl"));
  assert.deepEqual(events.map((e) => e.kind === "progress" ? e.message : `${e.command} -> ${e.exitCode}`), [
    "running git status --short", "running false", "false -> 1", "git status --short -> 0", "editing /tmp/spike-oqAa/a.txt",
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
  assert.deepEqual(events.map((e) => e.kind === "progress" ? e.message : `${e.command} -> ${e.exitCode}`), [
    "running git status --short", "git status --short -> 0", "running false", "false -> 1", "running printf 'b' > a.txt", "printf 'b' > a.txt -> 0",
  ]);
  const status = events.find((e) => e.kind === "command")!;
  assert.equal(status.kind === "command" && status.output, "?? b.txt\n?? c.txt\n");
});

test("command output is capped", () => {
  const events: LlmEvent[] = [];
  const line = JSON.stringify({ type: "item.completed", item: { id: "x", type: "command_execution", command: "yes", aggregated_output: "y".repeat(MAX_COMMAND_OUTPUT + 10), exit_code: 0, status: "completed" } });
  codexEventReader((e) => events.push(e))(line);
  const out = events[0]!.kind === "command" ? events[0]!.output : "";
  assert.ok(out.length < MAX_COMMAND_OUTPUT + 40);
  assert.ok(out.endsWith("[output truncated]"));
});

test("readers ignore lines that are not JSON events", () => {
  const events: LlmEvent[] = [];
  const reader = codexEventReader((e) => events.push(e));
  for (const line of ["Reading additional input from stdin...", "", "{broken", JSON.stringify({ type: "turn.started" })]) reader(line);
  assert.deepEqual(events, []);
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
