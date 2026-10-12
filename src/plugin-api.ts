/** @packageDocumentation
 * The server-side contract between core and plugins.
 *
 * Core owns sessions, the artifact store, tasks, epochs, the LLM backends, chat and the HTTP shell.
 * Everything a user works on is a plugin; review and chat are the standard library in `src/plugins/`.
 *
 * - A **plugin** (`Plugin`, built with `definePlugin`) bundles any of: workflows, phases, task
 *   definitions, artifact kinds, search kinds, chat context and reply fields, read-only session MCP tools (`Plugin.mcpTools`), and a server part
 *   with HTTP routes and background services. Registered in `src/plugins/index.ts`.
 * - A **workflow** (`Workflow`) is what a user starts from the start screen or a slash command.
 *   It parses its arguments and runs phases. A workflow's optional `precheck` can ask the start box
 *   one question about the work tree before any session exists.
 * - A **phase** (`Phase`) is one step of a workflow. `Runtime.runPhase` runs it as a new
 *   **epoch**: a stored, numbered run of one phase in a session with its input, status and error.
 *   Tasks and artifacts created meanwhile carry that epoch. A failed or cancelled epoch reruns in
 *   place with `Runtime.retryPhase`. One phase runs per session at a time (`PhaseBusyError`).
 * - A **task** (`TaskDefinition`, built with `defineTask`) is a unit of work run by the runtime,
 *   usually one LLM call or one deterministic import, producing artifacts with provenance.
 * - A workflow with `next` is driven by decisions: `Runtime.advance` calls `next(view)` over the stored
 *   epochs and artifacts and either runs the returned phase or stores a **Decision** artifact (a question
 *   with options, answered by a rule or by the user through `POST /api/sessions/:id/decisions/:artifactId`),
 *   and repeats until `next` returns null (waiting for the user, or done). A failed epoch stops the loop;
 *   Retry reruns it and advances again.
 *   Before the workflow's `next`, `advance` asks the phase of the latest succeeded epoch for its own follow-up (`Phase.next`), so a phase can ask its own decisions and run its follow-up phases in any workflow.
 * - An **artifact kind** (`ArtifactKind`) tells core how to render, search and overview a
 *   plugin's artifact type without importing plugin code.
 * - A **repo profile** (`RepoProfile`, contributed through `Plugin.repoProfiles`) says how to work in a
 *   kind of repository: commit style, message rule, check and test commands, phases after Accept. Workflows
 *   pick one per session; any plugin can add one.
 * - The **knowledge store** (`Runtime.knowledge`, `Knowledge`) keeps plugin data across sessions in its own SQLite file (`knowledge.db` next to the session database): versioned entries by scope, namespace and key. A `null` value is a tombstone; nothing is deleted through any API. Tasks read it through `TaskContext.knowledge` (read-only); plugin runtime code writes.
 * - **Code search** (`Runtime.codeSearch`, `TaskContext.codeSearch`, `CodeSearch`): spec links, enclosing functions, file reads and the revision per engine (Gecko and WebKit through searchfox, Blink through chromium-search and a brace scan).
 *
 * The web side of a plugin registers phase views and canvas node kinds through
 * `src/web/plugin-api.ts`, and builds canvas graphs from `src/web/graph-api.ts`; its registry is
 * `src/plugins/web.ts`. A web plugin may also offer **session views** (`WebPlugin.sessionViews`):
 * projections of the session shown instead of the phase view when chosen in the topbar; the choice
 * is in the URL (`?view=`). A canvas model (`CanvasModel`) may split its graph into named **places**
 * (`CanvasModel.places`): core owns the current place, its history entries, persistence, breadcrumb and
 * drill-in/out keys, and the model defines each place's graph, node representation and guide steps.
 * Zoom only scales the canvas. Core shows an Open button in the title bar of every node that opens a place
 * (`places.open`), and a breadcrumb bar above the canvas: the place crumbs, then a focus segment labelled by
 * `CanvasModel.focusLabel` for the focused diff row or the selected node. A model may add controls to the
 * canvas panel next to Expand all and Reset layout (`CanvasModel.PanelExtras`, rendered inside the model's `Provider`).
 * A model may add colored inline-item lines to minimap nodes with `CanvasModel.minimapMarks`.
 *
 * Boundary, checked by `scripts/plugin-boundary.ts` in `npm run check`: plugin code imports only its own
 * directory and these API modules. A plugin may also import the public API of another plugin it lists in
 * `Plugin.dependsOn`: only `src/plugins/<dep>/api.ts` (server and shared code) and
 * `src/plugins/<dep>/web/api.ts` (web code), never deeper modules; the registry rejects a missing
 * dependency and a cycle. Core imports no plugin code except the two registries, and only from
 * composition roots.
 */
export const definePlugin = <T extends import("./runtime/plugins.ts").Plugin>(plugin: T): T => plugin;
export type { ArtifactKind, ChatReplyField, McpTool, McpToolContext, ParseResult, Plugin, PluginRegistry, PluginServer, PrecheckQuestion, RepoProfile, WorkflowContext, StartInput, Step, Workflow } from "./runtime/plugins.ts";
/** Typed plugin MCP tools. */
export { defineMcpTool } from "./runtime/plugins.ts";
export { PhaseBusyError, defineTask } from "./runtime/tasks.ts";
export type { Phase, TaskContext, TaskDefinition, GitCapability, WebspecCapability, WebspecLookup, SearchfoxCapability, BlameEntry, StepCommentCheck } from "./runtime/tasks.ts";
export type { Runtime } from "./runtime/tasks.ts";
export type { Knowledge, KnowledgeEntry, KnowledgeProvenance, KnowledgeRead } from "./runtime/knowledge.ts";
/** Read-only code search per engine, and the brace scan used where no code index exists. */
export { ENGINES, specUrlParts } from "./runtime/code-search.ts";
export { escapeRegex } from "./shared/regex.ts";
export type { CodeSearch } from "./runtime/code-search.ts";
export { makeChromiumSearch } from "./runtime/chromium-search.ts";
export { enclosingFunction, functionsIn } from "./runtime/brace-scan.ts";
export type { ScannedFunction } from "./runtime/brace-scan.ts";
export type { SessionView, SearchDoc, WorkflowView } from "./runtime/render-ref.ts";
export { HttpError, send, readJson, str, text, llmField, startTask, requireSession, requireArtifact, putUserArtifact } from "./server/http.ts";
/** Creates a session after resolving its repository path. */
export { createSession } from "./runtime/git.ts";
/** Runs the workflow selected by a WorkflowStart artifact. */
export { runWorkflow } from "./workflows/start.ts";
export type { Route, HttpRouteContext } from "./server/http.ts";
export * from "./shared/types.ts";
export { searchDocs, sessionView, workflowView } from "./runtime/render-ref.ts";
export { Store } from "./runtime/store.ts";
export { makeGitWriter, makeGit } from "./runtime/git.ts";
/** Runs a process, optionally streaming stdout lines. */
export { runChecked, runProcess } from "./runtime/process.ts";
/** Structured LLM calls checked against their schema and a domain validator, with repair re-prompts. */
export { runStructured, schemaErrors } from "./runtime/structured.ts";
export type { JsonSchema, StructuredPrompt } from "./runtime/structured.ts";
/** A CommandRun record with capped output. */
export { commandRunData } from "./runtime/command-run.ts";
export { fetchBugMarkdown } from "./runtime/moz-mcp.ts";
export { prependRepoContext, readRepoSkill } from "./runtime/repo-context.ts";
export { isGeckoRepo } from "./runtime/searchfox.ts";
export { revisedText } from "./shared/revisions.ts";
export { plainText } from "./shared/plain-text.ts";
export { numberLines, fileRows } from "./shared/diff-lines.ts";
export type { Row } from "./shared/diff-lines.ts";
export type { GitWriter, PatchIdentity } from "./runtime/git.ts";
export type { LlmPrompt, LlmEvent } from "./runtime/llm/types.ts";

/** Sequence diagram proposals: schema, shape check and citation verification. */
export { diagramSchema, isDiagram, verifyDiagramAtBase, verifySequence } from "./runtime/diagram.ts";
export type { SequenceProposal, SequenceStepProposal } from "./runtime/diagram.ts";
