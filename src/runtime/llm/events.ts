import type { LlmActivity } from "../../shared/types.ts";
import type { LlmEvent } from "./types.ts";
import { capOutput } from "../process.ts";

/** Longest command output an event carries, in characters. */
export const MAX_COMMAND_OUTPUT = 256 * 1024;
/** Longest text or thinking an activity event carries, in characters. */
export const MAX_ACTIVITY_TEXT = 4000;
/** Longest tool output a `tool-result` activity carries, in characters. */
export const MAX_RESULT_OUTPUT = 16 * 1024;
const cap = (text: string) => capOutput(text, MAX_COMMAND_OUTPUT);
const parse = (line: string): Record<string, any> | null => { if (!line.startsWith("{")) return null; try { return JSON.parse(line); } catch { return null; } };
const firstLine = (text: string) => text.split("\n", 1)[0]!.slice(0, 200);
const said = (kind: "text" | "thinking", text: unknown): LlmEvent[] => typeof text === "string" && text.trim() ? [{ kind: "activity", activity: { kind, text: capOutput(text, MAX_ACTIVITY_TEXT) } }] : [];
const tool = (name: string, detail: string, callId?: string): LlmEvent => ({ kind: "activity", activity: { kind: "tool", name, detail: firstLine(detail), ...(callId ? { callId } : {}) } satisfies LlmActivity });
const toolResult = (callId: string, exitCode: number | null, durationMs: number, output: string): LlmEvent => ({ kind: "activity", activity: { kind: "tool-result", callId, exitCode, durationMs, output: capOutput(output, MAX_RESULT_OUTPUT) } });
/** The input that names what a tool call works on, else the whole input. */
const toolDetail = (input: Record<string, unknown>) => {
  const named = ["command", "file_path", "pattern", "path", "url", "query", "description"].map((key) => input[key]).find((value) => typeof value === "string");
  return typeof named === "string" ? named : JSON.stringify(input);
};
/** `/usr/bin/zsh -lc 'git status'` -> `git status`: Codex runs every command through a login shell. */
const unwrap = (command: string) => {
  const inner = /^(?:\S*\/)?(?:ba|z)?sh -lc (.+)$/s.exec(command)?.[1];
  if (inner === undefined) return command;
  return inner.length > 1 && (inner[0] === "'" || inner[0] === '"') && inner.at(-1) === inner[0] ? inner.slice(1, -1) : inner;
};

/** Reads Claude `--output-format stream-json` lines: the `system/init` line is the session event; assistant text, thinking and tool calls (except `StructuredOutput`, the run's answer) are activity. A tool result has no exit code field: an error result starts with `Exit code N`, else `is_error` decides 1 or 0. */
export function claudeEventReader(emit: (event: LlmEvent) => void, now: () => number = Date.now): (line: string) => void {
  const running = new Map<string, { command: string | null; startedAt: number }>();
  return (line) => {
    const event = parse(line);
    if (event?.type === "system" && event.subtype === "init" && typeof event.session_id === "string") emit({ kind: "session", providerSessionId: event.session_id });
    const blocks: any[] = Array.isArray(event?.message?.content) ? event!.message.content : [];
    if (event?.type === "assistant") for (const block of blocks) {
      if (block.type === "text" || block.type === "thinking") { for (const e of said(block.type, block.type === "text" ? block.text : block.thinking)) emit(e); continue; }
      if (block.type !== "tool_use") continue;
      const input = block.input ?? {};
      if (block.name !== "StructuredOutput") { emit(tool(block.name, toolDetail(input), block.id)); running.set(block.id, { command: block.name === "Bash" && typeof input.command === "string" ? input.command : null, startedAt: now() }); }
      if (block.name === "Bash" && typeof input.command === "string") {
        emit({ kind: "progress", message: `running ${firstLine(input.command)}` });
      } else if ((block.name === "Edit" || block.name === "Write") && typeof input.file_path === "string") emit({ kind: "progress", message: `editing ${input.file_path}` });
    }
    if (event?.type === "user") for (const block of blocks) {
      if (block.type !== "tool_result") continue;
      const started = running.get(block.tool_use_id);
      if (!started) continue;
      running.delete(block.tool_use_id);
      const output = typeof block.content === "string" ? block.content : Array.isArray(block.content) ? block.content.map((part: any) => part?.text ?? "").join("") : "";
      const code = /^Exit code (\d+)/.exec(output);
      const durationMs = now() - started.startedAt;
      const exitCode = started.command === null ? null : code ? Number(code[1]) : block.is_error ? 1 : 0;
      emit(toolResult(block.tool_use_id, exitCode, durationMs, output));
      if (started.command !== null) emit({ kind: "command", command: started.command, exitCode: exitCode!, durationMs, output: cap(output), callId: block.tool_use_id });
    }
  };
}

/** Reads Codex `exec --json` lines: `thread.started` is the session event, `command_execution` items become command events, `file_change` items progress. Messages, reasoning, commands, file changes, MCP calls and web searches are activity. `error` items are warnings and ignored. With `structured` (an `--output-schema` run) the turn's last agent message is the answer, so each message is held until another item shows it was not the last. */
export function codexEventReader(emit: (event: LlmEvent) => void, now: () => number = Date.now, structured = false): (line: string) => void {
  const started = new Map<string, number>();
  const elapsed = (id: string) => now() - (started.get(id) ?? now());
  let held: unknown = null;
  const release = () => { for (const e of said("text", held)) emit(e); held = null; };
  return (line) => {
    const event = parse(line);
    if (event?.type === "thread.started" && typeof event.thread_id === "string") { emit({ kind: "session", providerSessionId: event.thread_id }); return; }
    if (event?.type === "turn.completed") { held = null; return; }
    if (event?.type === "turn.failed") { release(); return; }
    const item = event?.item;
    if (!item) return;
    release();
    const completed = event!.type === "item.completed";
    if (completed && item.type === "agent_message") { if (structured) held = item.text; else for (const e of said("text", item.text)) emit(e); }
    else if (completed && item.type === "reasoning") for (const e of said("thinking", item.text)) emit(e);
    else if (event!.type === "item.started" && item.type === "mcp_tool_call") started.set(item.id, now());
    else if (completed && item.type === "mcp_tool_call") {
      emit(tool(`${item.server}.${item.tool}`, toolDetail(item.arguments ?? {}), item.id));
      const text = item.error?.message ?? (Array.isArray(item.result?.content) ? item.result.content.map((part: any) => part?.text ?? "").join("") : "");
      emit(toolResult(item.id, null, elapsed(item.id), text));
    }
    else if (completed && item.type === "web_search") emit(tool("web search", String(item.query ?? "")));
    if (item.type === "command_execution") {
      const command = unwrap(String(item.command));
      if (event!.type === "item.started") { started.set(item.id, now()); emit(tool("shell", command, item.id)); emit({ kind: "progress", message: `running ${firstLine(command)}` }); }
      else if (event!.type === "item.completed") {
        const exitCode = typeof item.exit_code === "number" ? item.exit_code : 1;
        const durationMs = elapsed(item.id);
        const output = String(item.aggregated_output ?? "");
        emit(toolResult(item.id, exitCode, durationMs, output));
        emit({ kind: "command", command, exitCode, durationMs, output: cap(output), callId: item.id });
      }
    } else if (item.type === "file_change" && event!.type === "item.completed") {
      for (const change of item.changes ?? []) { emit(tool("edit", String(change.path))); emit({ kind: "progress", message: `editing ${change.path}` }); }
    }
  };
}
