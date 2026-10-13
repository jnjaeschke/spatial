import type { ModelInfo } from "../../shared/types.ts";
import type { Writable } from "node:stream";
import { isExecutable, runProcess } from "../process.ts";
import { claudeEventReader } from "./events.ts";
import { LlmOutputError, type LlmBackend, type LlmRequest, type LlmResult } from "./types.ts";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export class ClaudeBackend implements LlmBackend {
  readonly id = "claude" as const;
  #bin: string;
  #readOnlyCommands: string[];

  /** `readOnlyCommands`: the shell commands a read-only run may execute (`Plugin.readOnlyCommands`). */
  constructor(opts: { bin?: string; readOnlyCommands?: string[] } = {}) {
    this.#bin = opts.bin ?? "claude";
    this.#readOnlyCommands = (opts.readOnlyCommands ?? []).map((command) => `Bash(${command}:*)`);
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!isExecutable(this.#bin)) throw new Error(`claude CLI not found: ${this.#bin}`);
    // The claude CLI has no model-listing command; aliases resolve to the latest models.
    return ["opus", "sonnet", "haiku"].map((id) => ({ id, efforts: EFFORTS }));
  }

  async run(req: LlmRequest): Promise<LlmResult> {
    const write = req.tools === "write";
    const mode = req.writeMode ?? "auto";
    const args = [
      "-p", "--output-format", "stream-json", "--verbose",
      "--model", req.model,
      "--effort", req.effort,
      "--setting-sources", "",
      "--tools", req.tools === "none" ? "" : write ? (mode === "editsOnly" ? "Read,Edit,Write" : "Read,Edit,Write,Bash") : "Read,Grep,Glob,Bash",
    ];
    if (write) args.push("--permission-mode", mode === "full" ? "bypassPermissions" : "auto");
    if (req.tools !== "none") {
      const mcpTools = Object.keys(req.mcpServers ?? {}).map((name) => `mcp__${name}__*`);
      const allowed = [...(req.tools === "read-only" ? this.#readOnlyCommands : []), ...mcpTools];
      if (allowed.length) args.push("--allowedTools", allowed.join(" "));
    }
    if (req.mcpServers && Object.keys(req.mcpServers).length) {
      args.push("--mcp-config", JSON.stringify({ mcpServers: req.mcpServers }), "--strict-mcp-config");
    }
    if (req.resumeProviderSession) args.push("--resume", req.resumeProviderSession);
    if (req.system !== undefined) args.push("--system-prompt", req.system);
    if (req.schema) args.push("--json-schema", JSON.stringify(req.schema));
    const live = req.liveInput && req.onLiveInput ? liveInput(req.onLiveInput) : null;
    if (live) args.push("--input-format", "stream-json", "--replay-user-messages");

    const events = req.onEvent ? claudeEventReader(req.onEvent) : undefined;
    const onStdoutLine = live ? (line: string) => { live.read(line); events?.(line); } : events;
    const { stdout, stderr, code } = await runProcess(this.#bin, args, { stdin: live ? (stdin) => live.open(stdin, req.prompt) : req.prompt, cwd: req.cwd, signal: req.signal, onStdoutLine });
    let out: Record<string, any> | undefined;
    for (const line of stdout.split("\n")) {
      if (!line.startsWith("{")) continue;
      try { const event = JSON.parse(line); if (event.type === "result") out = event; } catch { /* a partial line */ }
    }
    if (!out && code === 0) throw new Error("claude produced no result event");
    if (out?.is_error) throw new Error(`claude: ${out.result ?? out.subtype ?? "unknown error"}`);
    if (code !== 0 || !out) throw new Error(`claude exited with code ${code}: ${(stderr || stdout).trim().slice(-2000)}`);
    if (typeof out.session_id !== "string" || out.session_id.length === 0) throw new Error("claude: the run reported no session id");
    if (req.schema && out.structured_output === undefined) throw new LlmOutputError("claude returned no structured_output", out.session_id);

    const result: LlmResult = { text: out.result ?? "", providerSessionId: out.session_id };
    if (req.schema) result.json = out.structured_output;
    if (out.usage) {
      const cached = out.usage.cache_read_input_tokens ?? 0;
      result.usage = { inputTokens: (out.usage.input_tokens ?? 0) + (out.usage.cache_creation_input_tokens ?? 0) + cached, cachedInputTokens: cached, outputTokens: out.usage.output_tokens ?? 0, cumulative: false };
      if (typeof out.total_cost_usd === "number") result.usage.costUsd = out.total_cost_usd;
    }
    return result;
  }
}

const userMessage = (text: string) => `${JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } })}\n`;

/** Claude's stream-json input: the prompt is the first user message and later ones go in while the run works. Claude echoes each message as a replay when it reads it, and every read message is answered by a later `result`, so input ends at the first `result` with no message sent but unread. */
function liveInput(onLiveInput: NonNullable<LlmRequest["onLiveInput"]>) {
  let stdin: Writable | null = null;
  let unread = 0;
  const close = () => { if (!stdin) return; stdin.end(); stdin = null; onLiveInput(null); };
  return {
    open(stream: Writable, prompt: string) {
      stdin = stream;
      stream.on("close", close);
      unread = 1;
      stream.write(userMessage(prompt));
      onLiveInput((text) => { if (!stdin) return; unread++; stdin.write(userMessage(text)); });
    },
    read(line: string) {
      if (!line.startsWith("{")) return;
      let event: Record<string, unknown>;
      try { event = JSON.parse(line); } catch { return; }
      if (event.type === "user" && event.isReplay === true) unread--;
      else if (event.type === "result" && unread === 0) close();
    },
  };
}
