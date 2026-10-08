import type { z } from "zod";
import type { Id, LlmSelection, WorkflowInfo } from "../shared/types.ts";
import type { Runtime, TaskContext, TaskDefinition, Phase } from "./tasks.ts";
import type { Artifact, Ref } from "../shared/types.ts";
import type { SearchDoc, SessionView } from "./render-ref.ts";
import type { Route } from "../server/http.ts";

export type ParseResult<P> = { ok: true; params: P } | { ok: false; error: string };
export interface StartInput<P> { params: P; startId: Id; prompt: string; llm?: LlmSelection }
/** A kind of session. `start` orchestrates phases with `rt.runPhase`. */
export interface Workflow<P> extends WorkflowInfo {
  /** Validated input produced by the selector or slash command. */
  params: z.ZodType<P>;
  /** Deterministic parser for slash-command arguments. */
  parseArgs(args: string): ParseResult<P>;
  /** Runs the workflow to completion by orchestrating phases with rt.runPhase. */
  start(rt: Runtime, sessionId: Id, input: StartInput<P>): Promise<void>;
  /** Markdown sections for this workflow, each beginning with a heading. */
  overview?(view: SessionView): string[];
}
/** What core needs to treat one artifact type generically. */
export interface ArtifactKind {
  /** Search index entries for the artifact; `kind` of each doc must be in the plugin's `searchKinds`. */
  search?(view: SessionView, artifact: Artifact): SearchDoc[];
  /** Markdown for the artifact or one of its subrefs; null when unknown. `renderRef` renders another ref. */
  render?(view: SessionView, artifact: Artifact, subId: string | undefined, renderRef: (ref: Ref) => string): string | null;
}
/** Server routes and services of a plugin, built once per HTTP server. */
export interface PluginServer {
  routes?: Route[];
  /** Called while a client streams session events; returns its unwatch function. */
  watch?(sessionId: Id): () => void;
  /** Starts background services. Only server processes call it. */
  start?(): void;
}
/** A field a plugin adds to the structured chat reply. */
export interface ChatReplyField {
  name: string;
  /** Label shown in the reply error message. */
  label: string;
  /** JSON schema for the non-null value. Core makes it required and nullable. */
  schema: object;
  /** Section appended to the chat system prompt. */
  prompt: string;
  /** Validates the value and returns artifacts to store and link to the reply. */
  accept(ctx: TaskContext, value: unknown): Promise<{ ok: true; artifacts: { type: string; data: unknown }[] } | { ok: false; error: string }>;
}
/** A packaging unit that contributes runtime behavior. */
export interface Plugin {
  id: string;
  /** Workflows contributed by this plugin. */
  workflows?: Workflow<any>[];
  /** Phases contributed by this plugin. */
  phases?: Phase<any>[];
  /** Tasks contributed by this plugin. */
  tasks?: TaskDefinition<any, any>[];
  /** Artifact implementations keyed by artifact type. */
  artifactKinds?: Record<string, ArtifactKind>;
  /** Search document kinds produced by this plugin. */
  searchKinds?: string[];
  /** Extra context appended after the session overview in chat. */
  chatContext?(view: SessionView): string | null;
  /** Additional structured fields accepted on chat replies. */
  chatReplyFields?: ChatReplyField[];
  /** Builds server routes and services once per HTTP server. */
  server?(rt: Runtime, opts: { intervalMs?: number }): PluginServer;
}
export interface PluginRegistry {
  plugins: Plugin[];
  workflows: Map<string, Workflow<any>>;
  phases: Map<string, Phase<any>>;
  tasks: Map<string, TaskDefinition<any, any>>;
  artifactKinds: Record<string, ArtifactKind>;
  searchKinds: string[];
  chatContext: ((view: SessionView) => string | null)[];
  chatReplyFields: ChatReplyField[];
}

export function artifactKinds(plugins: Plugin[]): Record<string, ArtifactKind> {
  const kinds = { ...coreArtifactKinds };
  for (const plugin of plugins) for (const [type, kind] of Object.entries(plugin.artifactKinds ?? {})) {
    if (Object.hasOwn(kinds, type)) throw new Error(`Duplicate artifact kind: ${type}`);
    kinds[type] = kind;
  }
  return kinds;
}

export function searchKinds(plugins: Plugin[]): string[] {
  return [...new Set(["chat", "note", ...plugins.flatMap((plugin) => plugin.searchKinds ?? [])])];
}

export function pluginRegistry(plugins: Plugin[]): PluginRegistry {
  const workflows = new Map<string, Workflow<any>>(), phases = new Map<string, Phase<any>>(), tasks = new Map<string, TaskDefinition<any, any>>();
  const fields = new Map<string, ChatReplyField>();
  for (const plugin of plugins) {
    for (const workflow of plugin.workflows ?? []) { if (workflows.has(workflow.id)) throw new Error(`Duplicate workflow id: ${workflow.id}`); workflows.set(workflow.id, workflow); }
    for (const phase of plugin.phases ?? []) { if (phases.has(phase.id)) throw new Error(`Duplicate phase id: ${phase.id}`); phases.set(phase.id, phase); }
    for (const task of plugin.tasks ?? []) { if (tasks.has(task.kind)) throw new Error(`Duplicate task kind: ${task.kind}`); tasks.set(task.kind, task); }
    for (const field of plugin.chatReplyFields ?? []) { if (fields.has(field.name)) throw new Error(`Duplicate chat reply field: ${field.name}`); fields.set(field.name, field); }
  }
  return { plugins, workflows, phases, tasks, artifactKinds: artifactKinds(plugins), searchKinds: searchKinds(plugins), chatContext: plugins.flatMap((plugin) => plugin.chatContext ? [plugin.chatContext] : []), chatReplyFields: [...fields.values()] };
}

import { coreArtifactKinds } from "./render-ref.ts";
