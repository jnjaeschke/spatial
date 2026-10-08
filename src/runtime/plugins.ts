import type { z } from "zod";
import type { Id, LlmSelection, WorkflowInfo } from "../shared/types.ts";
import type { Runtime, TaskContext, TaskDefinition, Phase } from "./tasks.ts";
import type { Artifact, Ref } from "../shared/types.ts";
import type { SearchDoc, SessionView } from "./render-ref.ts";
import type { Route } from "../server/http.ts";
import { coreArtifactKinds } from "./render-ref.ts";

export type ParseResult<P> = { ok: true; params: P } | { ok: false; error: string };
export interface StartInput<P> { params: P; startId: Id; prompt: string; llm?: LlmSelection }
/** A kind of session; `start` runs it to completion by orchestrating phases with `rt.runPhase`. `description` is shown to the selector LLM and in the command popup; avoid e2e stub needles in it. */
export interface Workflow<P> extends WorkflowInfo {
  /** Params the selector must produce; a `z.strictObject` so its JSON schema is OpenAI-strict. Validates selector output. */
  params: z.ZodType<P>;
  /** Deterministic parser for slash-command arguments. */
  parseArgs(args: string): ParseResult<P>;
  start(rt: Runtime, sessionId: Id, input: StartInput<P>): Promise<void>;
  /** Session overview sections for sessions of this workflow; markdown, each starting with a `# ` heading. */
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
/** A packaging unit; contributes any mix of these. Artifact kinds are keyed by artifact type. */
export interface Plugin {
  id: string;
  /** Ids of the plugins this one imports the public API of (`src/plugins/<id>/api.ts`, `src/plugins/<id>/web/api.ts`); each must be registered, and the graph must have no cycle. Write it as a literal array in the manifest: `scripts/plugin-boundary.ts` reads it statically. */
  dependsOn?: string[];
  workflows?: Workflow<any>[];
  phases?: Phase<any>[];
  tasks?: TaskDefinition<any, any>[];
  artifactKinds?: Record<string, ArtifactKind>;
  searchKinds?: string[];
  /** Extra chat context after the session overview; null when it has none for this session. */
  chatContext?(view: SessionView): string | null;
  /** Extra fields of the structured chat reply. */
  chatReplyFields?: ChatReplyField[];
  server?(rt: Runtime, opts: { intervalMs?: number }): PluginServer;
}
/** Contributions of a plugin list merged by `pluginRegistry`, which throws on duplicate ids. */
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
  const ids = new Set(plugins.map((plugin) => plugin.id));
  for (const plugin of plugins) for (const dependency of plugin.dependsOn ?? []) {
    if (!ids.has(dependency)) throw new Error(`Plugin ${plugin.id} depends on ${dependency}, which is not registered`);
  }
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const done = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (path.includes(id)) throw new Error(`Plugin dependency cycle: ${[...path.slice(path.indexOf(id)), id].join(" -> ")}`);
    if (done.has(id)) return;
    for (const dependency of byId.get(id)!.dependsOn ?? []) visit(dependency, [...path, id]);
    done.add(id);
  };
  for (const plugin of plugins) visit(plugin.id, []);
  return { plugins, workflows, phases, tasks, artifactKinds: artifactKinds(plugins), searchKinds: searchKinds(plugins), chatContext: plugins.flatMap((plugin) => plugin.chatContext ? [plugin.chatContext] : []), chatReplyFields: [...fields.values()] };
}
