import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelInfo, WriteMode } from "../../shared/types.ts";
import { runProcess } from "../process.ts";
import { codexEventReader } from "./events.ts";
import { LlmOutputError, type LlmBackend, type LlmRequest, type LlmResult } from "./types.ts";

export class CodexBackend implements LlmBackend {
  readonly id = "codex" as const;
  #bin: string;
  #codexHome: string;

  constructor(opts: { bin?: string; codexHome?: string } = {}) {
    this.#bin = opts.bin ?? "codex";
    this.#codexHome = opts.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
  }

  async listModels(): Promise<ModelInfo[]> {
    // Private cache file of the codex CLI; may change shape across codex versions.
    const path = join(this.#codexHome, "models_cache.json");
    let parsed: { models: { slug: string; visibility: string; supported_reasoning_levels: { effort: string }[] }[] };
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      throw new Error(`Cannot read codex model list at ${path}: ${(e as Error).message}`);
    }
    return parsed.models
      .filter((m) => m.visibility === "list")
      .map((m) => ({ id: m.slug, efforts: m.supported_reasoning_levels.map((l) => l.effort) }));
  }

  async run(req: LlmRequest): Promise<LlmResult> {
    const mode = req.writeMode ?? "auto";
    const common = [
      "--json", "--skip-git-repo-check", "--ignore-user-config",
      "-m", req.model,
      "-c", `model_reasoning_effort=${req.effort}`,
    ];
    const sandbox = sandboxArgs(req.tools, mode, Boolean(req.resumeProviderSession));
    const args = req.resumeProviderSession
      ? ["exec", "resume", ...common, ...sandbox]
      : ["exec", ...common, ...sandbox, ...(req.cwd ? ["-C", req.cwd] : [])];
    for (const [name, server] of Object.entries(req.mcpServers ?? {})) {
      if (server.type === "http") {
        args.push("-c", `mcp_servers.${name}.url=${JSON.stringify(server.url)}`);
      } else {
        args.push("-c", `mcp_servers.${name}.command=${JSON.stringify(server.command)}`);
        args.push("-c", `mcp_servers.${name}.args=${JSON.stringify(server.args)}`);
        if (server.env) {
          for (const [key, value] of Object.entries(server.env)) {
            args.push("-c", `mcp_servers.${name}.env.${key}=${JSON.stringify(value)}`);
          }
        }
      }
    }
    let tmp: string | undefined;
    if (req.schema) {
      tmp = mkdtempSync(join(tmpdir(), "codex-schema-"));
      const schemaPath = join(tmp, "schema.json");
      writeFileSync(schemaPath, JSON.stringify(req.schema));
      args.push("--output-schema", schemaPath);
    }
    if (req.resumeProviderSession) args.push(req.resumeProviderSession, "-");
    const stdin = req.system !== undefined && !req.resumeProviderSession ? `${req.system}\n\n${req.prompt}` : req.prompt;
    try {
      const { stdout, stderr, code } = await runProcess(this.#bin, args, { stdin, cwd: req.cwd, signal: req.signal, onStdoutLine: req.onEvent ? codexEventReader(req.onEvent, Date.now, Boolean(req.schema)) : undefined });
      return parseCodexOutput(stdout, stderr, code, Boolean(req.schema));
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  }
}

const NO_SHELL = ["--disable", "shell_tool", "--disable", "unified_exec"];

/** `exec resume` accepts neither `--sandbox`, `--approve-for-me` nor `-C`: a resumed run states the same policy as `-c` overrides (auto mode: workspace-write sandbox, approval requests routed to automatic review) and works in the process cwd. */
function sandboxArgs(tools: LlmRequest["tools"], mode: WriteMode, resumed: boolean): string[] {
  if (tools !== "write") {
    const readOnly = resumed ? ["-c", 'sandbox_mode="read-only"'] : ["--sandbox", "read-only"];
    return tools === "none" ? [...readOnly, ...NO_SHELL] : readOnly;
  }
  if (mode === "full") return ["--dangerously-bypass-approvals-and-sandbox"];
  const workspace = resumed ? ["-c", 'sandbox_mode="workspace-write"'] : ["--sandbox", "workspace-write"];
  if (mode === "editsOnly") return [...workspace, ...NO_SHELL];
  return resumed ? [...workspace, "-c", 'approval_policy="on-request"', "-c", 'approvals_reviewer="auto_review"'] : ["--approve-for-me"];
}

function parseCodexOutput(stdout: string, stderr: string, code: number, structured: boolean): LlmResult {
  let threadId: string | undefined;
  let text: string | undefined;
  let usage: LlmResult["usage"];
  let error: string | undefined;
  let warning: string | undefined;
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    const e = JSON.parse(line);
    if (e.type === "thread.started") threadId = e.thread_id;
    else if (e.type === "item.completed" && e.item?.type === "agent_message") text = e.item.text;
    else if (e.type === "turn.completed") usage = { inputTokens: e.usage?.input_tokens ?? 0, cachedInputTokens: e.usage?.cached_input_tokens ?? 0, outputTokens: e.usage?.output_tokens ?? 0, cumulative: true };
    else if (e.type === "turn.failed") error = e.error?.message ?? "turn failed";
    else if (e.type === "error") warning = e.message ?? "error";
  }
  if (error) throw new Error(`codex: ${error}`);
  if (code !== 0) throw new Error(`codex exited with code ${code}: ${stderr.trim().slice(-2000)}`);
  if (threadId === undefined || threadId.length === 0) throw new Error("codex: the run reported no thread id");
  if (text === undefined) throw new Error(`codex produced no agent message${warning ? `: ${warning}` : ""}`);
  const result: LlmResult = { text, providerSessionId: threadId };
  if (usage) result.usage = usage;
  if (structured) {
    try {
      result.json = JSON.parse(text);
    } catch {
      throw new LlmOutputError(`codex returned invalid JSON: ${text.slice(0, 500)}`, threadId);
    }
  }
  return result;
}
