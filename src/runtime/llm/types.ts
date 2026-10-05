import type { BackendModels, LlmBackendId, LlmSelection, ModelInfo } from "../../shared/types.ts";

/** What a task asks of an LLM; model/effort are resolved by the LLM manager. */
export interface LlmPrompt {
  prompt: string;
  system?: string;
  /** JSON schema for structured output. Must be OpenAI-strict compatible (additionalProperties: false, all properties required). */
  schema?: object;
  cwd?: string;
  tools: "none" | "read-only";
  /** Continue this provider session instead of starting a new one. */
  resumeProviderSession?: string;
}

export interface LlmRequest extends LlmPrompt {
  model: string;
  effort: string;
  signal: AbortSignal;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

export interface LlmResult {
  text: string;
  /** Parsed structured output; present iff a schema was given. */
  json?: unknown;
  providerSessionId: string;
  usage?: LlmUsage;
}

export interface LlmRunResult extends LlmResult {
  selection: LlmSelection;
}

export interface LlmBackend {
  id: LlmBackendId;
  listModels(): Promise<ModelInfo[]>;
  run(req: LlmRequest): Promise<LlmResult>;
}

/** Runtime-owned LLM management. `selection` undefined means the configured default. */
export interface LlmService {
  readonly defaultSelection: LlmSelection;
  run(selection: LlmSelection | undefined, prompt: LlmPrompt, signal: AbortSignal): Promise<LlmRunResult>;
  /** One failing backend (e.g. codex not installed) must not hide the others. */
  listModels(): Promise<Record<LlmBackendId, BackendModels>>;
}
