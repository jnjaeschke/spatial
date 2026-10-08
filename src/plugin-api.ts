/** @packageDocumentation
 * Plugins package workflows, phases, tasks, artifact kinds and optional server services.
 * A workflow starts phases; each phase run is stored as an epoch, and its tasks and artifacts inherit that epoch.
 * Artifact kinds teach core how to search and render plugin artifacts without importing plugin code.
 * Plugin code should import core contracts from this module and otherwise stay inside its plugin directory.
 * Standard plugins live in `src/plugins/` and are registered in `src/plugins/index.ts`.
 */
export const definePlugin = <T extends import("./runtime/plugins.ts").Plugin>(plugin: T): T => plugin;
export type { ArtifactKind, ChatReplyField, ParseResult, Plugin, PluginRegistry, PluginServer, StartInput, Workflow } from "./runtime/plugins.ts";
export { PhaseBusyError, defineTask } from "./runtime/tasks.ts";
export type { Phase, TaskContext, TaskDefinition, GitCapability, WebspecCapability, SearchfoxCapability, BlameEntry, StepCommentCheck } from "./runtime/tasks.ts";
export type { Runtime } from "./runtime/tasks.ts";
export type { SessionView, SearchDoc } from "./runtime/render-ref.ts";
export { HttpError, send, readJson, str, requireSession, requireArtifact, putUserArtifact } from "./server/http.ts";
export type { Route, HttpRouteContext } from "./server/http.ts";
export * from "./shared/types.ts";
