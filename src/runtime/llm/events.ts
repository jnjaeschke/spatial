import type { LlmEvent } from "./types.ts";
import { capOutput } from "../process.ts";

/** Longest command output an event carries, in characters. */
export const MAX_COMMAND_OUTPUT = 256 * 1024;
const cap = (text: string) => capOutput(text, MAX_COMMAND_OUTPUT);
const parse = (line: string): Record<string, any> | null => { if (!line.startsWith("{")) return null; try { return JSON.parse(line); } catch { return null; } };
const firstLine = (text: string) => text.split("\n", 1)[0]!.slice(0, 200);
/** `/usr/bin/zsh -lc 'git status'` -> `git status`: Codex runs every command through a login shell. */
const unwrap = (command: string) => {
  const inner = /^(?:\S*\/)?(?:ba|z)?sh -lc (.+)$/s.exec(command)?.[1];
  if (inner === undefined) return command;
  return inner.length > 1 && (inner[0] === "'" || inner[0] === '"') && inner.at(-1) === inner[0] ? inner.slice(1, -1) : inner;
};

/** Reads Claude `--output-format stream-json` lines: the `system/init` line is the session event. A tool result has no exit code field: an error result starts with `Exit code N`, else `is_error` decides 1 or 0. */
export function claudeEventReader(emit: (event: LlmEvent) => void, now: () => number = Date.now): (line: string) => void {
  const running = new Map<string, { command: string; startedAt: number }>();
  return (line) => {
    const event = parse(line);
    if (event?.type === "system" && event.subtype === "init" && typeof event.session_id === "string") emit({ kind: "session", providerSessionId: event.session_id });
    const blocks: any[] = Array.isArray(event?.message?.content) ? event!.message.content : [];
    if (event?.type === "assistant") for (const block of blocks) {
      if (block.type !== "tool_use") continue;
      const input = block.input ?? {};
      if (block.name === "Bash" && typeof input.command === "string") {
        running.set(block.id, { command: input.command, startedAt: now() });
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
      emit({ kind: "command", command: started.command, exitCode: code ? Number(code[1]) : block.is_error ? 1 : 0, durationMs: now() - started.startedAt, output: cap(output) });
    }
  };
}

/** Reads Codex `exec --json` lines: `thread.started` is the session event, `command_execution` items become command events, `file_change` items progress. `error` items are warnings and ignored. */
export function codexEventReader(emit: (event: LlmEvent) => void, now: () => number = Date.now): (line: string) => void {
  const started = new Map<string, number>();
  return (line) => {
    const event = parse(line);
    if (event?.type === "thread.started" && typeof event.thread_id === "string") { emit({ kind: "session", providerSessionId: event.thread_id }); return; }
    const item = event?.item;
    if (!item) return;
    if (item.type === "command_execution") {
      const command = unwrap(String(item.command));
      if (event!.type === "item.started") { started.set(item.id, now()); emit({ kind: "progress", message: `running ${firstLine(command)}` }); }
      else if (event!.type === "item.completed") emit({ kind: "command", command, exitCode: typeof item.exit_code === "number" ? item.exit_code : 1, durationMs: now() - (started.get(item.id) ?? now()), output: cap(String(item.aggregated_output ?? "")) });
    } else if (item.type === "file_change" && event!.type === "item.completed") {
      for (const change of item.changes ?? []) emit({ kind: "progress", message: `editing ${change.path}` });
    }
  };
}
