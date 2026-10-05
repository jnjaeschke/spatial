import type { ModelInfo } from "../../shared/types.ts";
import { runProcess } from "./process.ts";
import type { LlmBackend, LlmRequest, LlmResult } from "./types.ts";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

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
    const args = [
      "-p", "--output-format", "json",
      "--model", req.model,
      "--effort", req.effort,
      "--setting-sources", "",
      "--tools", req.tools === "none" ? "" : "Read,Grep,Glob",
    ];
    if (req.system !== undefined) args.push("--system-prompt", req.system);
    if (req.schema) args.push("--json-schema", JSON.stringify(req.schema));

    const { stdout, stderr, code } = await runProcess(this.#bin, args, { stdin: req.prompt, cwd: req.cwd, signal: req.signal });
    let out: Record<string, any> | undefined;
    try {
      out = JSON.parse(stdout);
    } catch {
      out = undefined;
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
