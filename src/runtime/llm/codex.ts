import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelInfo } from "../../shared/types.ts";
import { runProcess } from "../process.ts";
import type { LlmBackend, LlmRequest, LlmResult } from "./types.ts";

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
    const args = [
      "exec", "--json", "--skip-git-repo-check", "--ignore-user-config",
      "-m", req.model,
      "-c", `model_reasoning_effort=${req.effort}`,
      "--sandbox", "read-only",
    ];
    if (req.cwd) args.push("-C", req.cwd);
    let tmp: string | undefined;
    if (req.schema) {
      tmp = mkdtempSync(join(tmpdir(), "codex-schema-"));
      const schemaPath = join(tmp, "schema.json");
      writeFileSync(schemaPath, JSON.stringify(req.schema));
      args.push("--output-schema", schemaPath);
    }
    const stdin = req.system !== undefined ? `${req.system}\n\n${req.prompt}` : req.prompt;
    try {
      const { stdout, stderr, code } = await runProcess(this.#bin, args, { stdin, cwd: req.cwd, signal: req.signal });
      return parseCodexOutput(stdout, stderr, code, Boolean(req.schema));
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  }
}

function parseCodexOutput(stdout: string, stderr: string, code: number, structured: boolean): LlmResult {
  let threadId: string | undefined;
  let text: string | undefined;
  let usage: LlmResult["usage"];
  let error: string | undefined;
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    const e = JSON.parse(line);
    if (e.type === "thread.started") threadId = e.thread_id;
    else if (e.type === "item.completed" && e.item?.type === "agent_message") text = e.item.text;
    else if (e.type === "turn.completed") usage = { inputTokens: e.usage?.input_tokens ?? 0, outputTokens: e.usage?.output_tokens ?? 0 };
    else if (e.type === "turn.failed") error = e.error?.message ?? "turn failed";
    else if (e.type === "error") error = e.message ?? "error";
  }
  if (error) throw new Error(`codex: ${error}`);
  if (code !== 0) throw new Error(`codex exited with code ${code}: ${stderr.trim().slice(-2000)}`);
  if (text === undefined || threadId === undefined) throw new Error("codex produced no agent message");
  const result: LlmResult = { text, providerSessionId: threadId };
  if (usage) result.usage = usage;
  if (structured) {
    try {
      result.json = JSON.parse(text);
    } catch {
      throw new Error(`codex returned invalid JSON: ${text.slice(0, 500)}`);
    }
  }
  return result;
}
