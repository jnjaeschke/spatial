import type { ModelInfo } from "../../shared/types.ts";
import { runProcess } from "../process.ts";
import { claudeEventReader } from "./events.ts";
import type { LlmBackend, LlmRequest, LlmResult } from "./types.ts";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
/** What a read-only run may execute: searchfox-cli, chromium-search (every subcommand reads), and webspec-index's query subcommands (not `update`, `reparse` or `clear-db`, which rewrite its index). */
const READ_ONLY_COMMANDS = ["searchfox-cli", "chromium-search", ...["query", "search", "refs", "anchors", "idl", "trace", "effects", "exists"].map((sub) => `webspec-index ${sub}`)].map((command) => `Bash(${command}:*)`);

export class ClaudeBackend implements LlmBackend {
  readonly id = "claude" as const;
  #bin: string;

  constructor(opts: { bin?: string } = {}) {
    this.#bin = opts.bin ?? "claude";
  }

  async listModels(): Promise<ModelInfo[]> {
    // The claude CLI has no model-listing command; aliases resolve to the latest models.
    return ["opus", "sonnet", "haiku"].map((id) => ({ id, efforts: EFFORTS }));
  }

  async run(req: LlmRequest): Promise<LlmResult> {
    const write = req.tools === "write";
    const mode = req.writeMode ?? "auto";
    const args = [
      "-p", "--output-format", write ? "stream-json" : "json", ...(write ? ["--verbose"] : []),
      "--model", req.model,
      "--effort", req.effort,
      "--setting-sources", "",
      "--tools", req.tools === "none" ? "" : write ? (mode === "editsOnly" ? "Read,Edit,Write" : "Read,Edit,Write,Bash") : "Read,Grep,Glob,Bash",
    ];
    if (write) args.push("--permission-mode", mode === "full" ? "bypassPermissions" : "auto");
    if (req.tools !== "none") {
      const mcpTools = Object.keys(req.mcpServers ?? {}).map((name) => `mcp__${name}__*`);
      const allowed = [...(req.tools === "read-only" ? READ_ONLY_COMMANDS : []), ...mcpTools];
      if (allowed.length) args.push("--allowedTools", allowed.join(" "));
    }
    if (req.mcpServers && Object.keys(req.mcpServers).length) {
      args.push("--mcp-config", JSON.stringify({ mcpServers: req.mcpServers }), "--strict-mcp-config");
    }
    if (req.resumeProviderSession) args.push("--resume", req.resumeProviderSession);
    if (req.system !== undefined) args.push("--system-prompt", req.system);
    if (req.schema) args.push("--json-schema", JSON.stringify(req.schema));

    const { stdout, stderr, code } = await runProcess(this.#bin, args, { stdin: req.prompt, cwd: req.cwd, signal: req.signal, onStdoutLine: write && req.onEvent ? claudeEventReader(req.onEvent) : undefined });
    let out: Record<string, any> | undefined;
    if (write) {
      for (const line of stdout.split("\n")) {
        if (!line.startsWith("{")) continue;
        try { const event = JSON.parse(line); if (event.type === "result") out = event; } catch { /* a partial line */ }
      }
      if (!out && code === 0) throw new Error("claude produced no result event");
    } else {
      try { out = JSON.parse(stdout); } catch { out = undefined; }
    }
    if (out?.is_error) throw new Error(`claude: ${out.result ?? out.subtype ?? "unknown error"}`);
    if (code !== 0 || !out) throw new Error(`claude exited with code ${code}: ${(stderr || stdout).trim().slice(-2000)}`);
    if (req.schema && out.structured_output === undefined) throw new Error("claude returned no structured_output");

    const result: LlmResult = { text: out.result ?? "", providerSessionId: out.session_id };
    if (req.schema) result.json = out.structured_output;
    if (out.usage) {
      result.usage = { inputTokens: out.usage.input_tokens ?? 0, outputTokens: out.usage.output_tokens ?? 0 };
      if (typeof out.total_cost_usd === "number") result.usage.costUsd = out.total_cost_usd;
    }
    return result;
  }
}
