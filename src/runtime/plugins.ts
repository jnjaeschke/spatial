import type { z } from "zod";
import type { DecisionData, DecisionOption, Id, LlmSelection, WorkflowInfo } from "../shared/types.ts";
import type { Runtime, TaskContext, TaskDefinition, Phase, WebspecCapability } from "./tasks.ts";
import type { CodeSearch } from "./code-search.ts";
import type { Engine } from "../shared/types.ts";
import type { Artifact, Ref } from "../shared/types.ts";
import type { SearchDoc, SessionView, WorkflowView } from "./render-ref.ts";
import type { Route } from "../server/http.ts";
import type { Knowledge } from "./knowledge.ts";
import { coreArtifactKinds } from "./render-ref.ts";

export type ParseResult<P> = { ok: true; params: P } | { ok: false; error: string };
/** What a workflow does next: run a phase, or take a decision. A decision with `chosen` is made by a rule and stored already answered; without it the user is asked. `epoch` is the epoch the decision is about (default: the latest); a workflow sets it when phases it does not own may have run since. */
export type Step =
  | { run: string; input: unknown }
  | { decide: { question: string; options: DecisionOption[] }; chosen?: { option: string; reason: string }; epoch?: number };
export interface StartInput<P> { params: P; startId: Id; prompt: string; llm?: LlmSelection }
/** A question asked before the session exists; the chosen option's `params` are merged into the workflow params, an option without `params` cancels the start. */
export interface PrecheckQuestion<P> { question: string; options: { label: string; params?: Partial<P> }[] }
/** How to work in one kind of repository. Plugins contribute profiles; workflows pick one per session. */
export interface RepoProfile {
  id: string;
  /** Shown to the workflow selector LLM. */
  description: string;
  /** Deterministic hint that the work tree root `repo` is this kind of repository. */
  detect?(repo: string): Promise<boolean>;
  commitStyle: "stack" | "single";
  /** A bug number is given or asked for, never invented. */
  requiresBug?: boolean;
  /** Null when the commit subject is acceptable, else what is wrong. */
  messageCheck?(message: string): string | null;
  /** Shell command that builds and runs the tests covering `paths`; its presence makes edits-only mode available. It runs through `sh -c` and the paths come from the agent, so implementations must shell-quote them. */
  checkCommand?(paths: string[]): string;
  /** Whether a shell command runs tests (shown as a pass/fail chip). */
  isTestCommand?(command: string): boolean;
  /** Phase id that investigates; default `investigate`. */
  investigatePhase?: string;
  /** Automatic fix rounds before the user is asked; default 2, 0 always asks. */
  autoFixRounds?: number;
  /** Phase ids run in order right after the user accepts; a phase with an outside effect asks first through its own `Phase.next`. */
  afterAccept?: string[];
}
/** What `Workflow.next` may consult besides the stored session state. */
export interface WorkflowContext { repoProfiles: ReadonlyMap<string, RepoProfile> }
/** A kind of session; `start` runs it to completion by orchestrating phases with `rt.runPhase`. `description` is shown to the selector LLM and in the command popup; avoid e2e stub needles in it. */
export interface Workflow<P> extends WorkflowInfo {
  /** Params the selector must produce; a `z.strictObject` so its JSON schema is OpenAI-strict. Validates selector output. */
  params: z.ZodType<P>;
  /** Deterministic parser for slash-command arguments. */
  parseArgs(args: string): ParseResult<P>;
  /** Deterministic check of the work tree `repo` before the session exists; a question is shown in the start box (slash commands) or stored as a selector question (selected workflows). */
  precheck?(repo: string, params: P): Promise<PrecheckQuestion<P> | null>;
  start(rt: Runtime, sessionId: Id, input: StartInput<P>): Promise<void>;
  /** Reads only stored state and returns the next step; null means wait (an open decision) or done. Called by `Runtime.advance` after the workflow's `start`, after each successful epoch and after each answered decision; a decision it returns must not repeat for the same (question, epoch) once answered. */
  next?(view: WorkflowView, ctx: WorkflowContext): Step | null;
  /** Why the user cannot take `option` of the open `decision` now, or null to accept it. A refused answer leaves the decision open. */
  checkAnswer?(view: WorkflowView, decision: Artifact<DecisionData>, option: string): string | null;
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
  /** Validates the value and returns artifacts to store and link to the reply, and optionally a phase for the runtime to start after the turn (one per reply). */
  accept(ctx: TaskContext, value: unknown): Promise<{ ok: true; artifacts: { type: string; data: unknown }[]; run?: { phase: string; input: unknown } } | { ok: false; error: string }>;
}
/** What a plugin MCP tool may use: the session, its work tree, read-only capabilities and the call's abort signal. */
export interface McpToolContext { sessionId: Id; repo: string; webspec: WebspecCapability; knowledge: Pick<Knowledge, "get">; codeSearch: Record<Engine, CodeSearch>; signal: AbortSignal }
/** A read-only tool a plugin adds to the session MCP server (`spatial`), which LLM tasks reach through `ctx.sessionMcp`. `input` is the zod shape of its arguments; `run` returns the text answer and throws for an error answer. */
export interface McpTool<S extends z.ZodRawShape = z.ZodRawShape> { name: string; description: string; input: S; run(ctx: McpToolContext, input: z.infer<z.ZodObject<S>>): Promise<string> }
/** An `McpTool` whose `run` input is typed from its `input` shape. */
export const defineMcpTool = <S extends z.ZodRawShape>(tool: McpTool<S>): McpTool => tool as unknown as McpTool;
/** A packaging unit; contributes any mix of these. Artifact kinds are keyed by artifact type. */
export interface Plugin {
  id: string;
  /** Ids of the plugins this one imports the public API of (`src/plugins/<id>/api.ts`, `src/plugins/<id>/web/api.ts`); each must be registered, and the graph must have no cycle. Write it as a literal array in the manifest: `scripts/plugin-boundary.ts` reads it statically. */
  dependsOn?: string[];
  /** Repo profiles this plugin contributes; ids are unique across plugins. */
  repoProfiles?: RepoProfile[];
  workflows?: Workflow<any>[];
  phases?: Phase<any>[];
  tasks?: TaskDefinition<any, any>[];
  artifactKinds?: Record<string, ArtifactKind>;
  searchKinds?: string[];
  /** Extra chat context after the session overview; null when it has none for this session. */
  chatContext?(view: SessionView): string | null;
  /** Extra fields of the structured chat reply. */
  chatReplyFields?: ChatReplyField[];
  /** Read-only tools for the session MCP server; names are unique across plugins and must not be a core tool's name. */
  mcpTools?: McpTool[];
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
  mcpTools: McpTool[];
  repoProfiles: Map<string, RepoProfile>;
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
  const repoProfiles = new Map<string, RepoProfile>();
  const fields = new Map<string, ChatReplyField>();
  const mcpTools = new Map<string, McpTool>();
  for (const plugin of plugins) {
    for (const profile of plugin.repoProfiles ?? []) { if (repoProfiles.has(profile.id)) throw new Error(`Duplicate repo profile: ${profile.id}`); repoProfiles.set(profile.id, profile); }
    for (const workflow of plugin.workflows ?? []) { if (workflows.has(workflow.id)) throw new Error(`Duplicate workflow id: ${workflow.id}`); workflows.set(workflow.id, workflow); }
    for (const phase of plugin.phases ?? []) { if (phases.has(phase.id)) throw new Error(`Duplicate phase id: ${phase.id}`); phases.set(phase.id, phase); }
    for (const task of plugin.tasks ?? []) { if (tasks.has(task.kind)) throw new Error(`Duplicate task kind: ${task.kind}`); tasks.set(task.kind, task); }
    for (const field of plugin.chatReplyFields ?? []) { if (fields.has(field.name)) throw new Error(`Duplicate chat reply field: ${field.name}`); fields.set(field.name, field); }
    for (const tool of plugin.mcpTools ?? []) { if (mcpTools.has(tool.name)) throw new Error(`Duplicate MCP tool: ${tool.name}`); mcpTools.set(tool.name, tool); }
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
  return { plugins, workflows, phases, tasks, artifactKinds: artifactKinds(plugins), searchKinds: searchKinds(plugins), chatContext: plugins.flatMap((plugin) => plugin.chatContext ? [plugin.chatContext] : []), chatReplyFields: [...fields.values()], mcpTools: [...mcpTools.values()], repoProfiles };
}
