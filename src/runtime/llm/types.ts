import type { BackendModels, LlmActivity, LlmBackendId, LlmSelection, ModelInfo, WriteMode } from "../../shared/types.ts";

/** The run finished but its output does not have the requested shape; `providerSessionId` lets the caller resume it with the problem. */
export class LlmOutputError extends Error {
  readonly providerSessionId: string;
  constructor(message: string, providerSessionId: string) {
    super(message);
    this.providerSessionId = providerSessionId;
  }
}

/** What a task asks of an LLM; model/effort are resolved by the LLM manager. */
export interface LlmPrompt {
  prompt: string;
  system?: string;
  /** JSON schema for structured output. Must be OpenAI-strict compatible (additionalProperties: false, all properties required). */
  schema?: object;
  cwd?: string;
  tools: "none" | "read-only" | "write";
  /** With `tools: "write"`: `auto` lets the CLI's own approval logic allow edits and commands, `full` skips approvals and sandboxing, `editsOnly` allows file edits without any shell. Default `auto`. */
  writeMode?: WriteMode;
  /** Receives the run's events as its output streams. */
  onEvent?: (event: LlmEvent) => void;
  /** Continue this provider session instead of starting a new one; a resumed write run keeps the write mode's tools and permissions. */
  resumeProviderSession?: string;
  mcpServers?: Record<string, McpServerSpec>;
  /** The run reads messages sent to its task with `Runtime.sendLiveInput` while it works. Only the Claude backend supports it. */
  liveInput?: boolean;
}

/** Progress, finished shell commands, activity and the provider session id of a run, in stream order; `session` comes first, as soon as the stream shows the id. `output` is capped at 256 KB. */
export type LlmEvent =
  | { kind: "progress"; message: string }
  | { kind: "command"; command: string; exitCode: number; durationMs: number; output: string; callId?: string }
  | { kind: "activity"; activity: LlmActivity }
  | { kind: "session"; providerSessionId: string };

export type McpServerSpec =
  | { type: "stdio"; command: string; args: string[]; env?: Record<string, string> }
  | { type: "http"; url: string };

export interface LlmRequest extends LlmPrompt {
  model: string;
  effort: string;
  signal: AbortSignal;
  /** With `liveInput`, a backend that supports it calls this with a function handing text to the running agent, which reads it after its current tool call, and with null once the run reads no more. */
  onLiveInput?: (send: ((text: string) => void) | null) => void;
}

export interface LlmUsage {
  /** All input tokens, cached ones included. */
  inputTokens: number;
  /** The share of `inputTokens` read from the provider's prompt cache. */
  cachedInputTokens: number;
  outputTokens: number;
  /** The run's cost as the provider reports it; codex reports none. */
  costUsd?: number;
  /** The counts cover the provider session so far (codex), not this run alone (claude). */
  cumulative: boolean;
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
  run(selection: LlmSelection | undefined, prompt: LlmPrompt & Pick<LlmRequest, "onLiveInput">, signal: AbortSignal): Promise<LlmRunResult>;
  /** One failing backend (e.g. codex not installed) must not hide the others. */
  listModels(): Promise<Record<LlmBackendId, BackendModels>>;
}
