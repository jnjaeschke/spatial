import type { ModelsResponse, SessionState } from "../shared/types.ts";
import type { PhaseView, PhaseViewProps, PluginSessionView, WebPlugin } from "./plugin-api.ts";

/** The view of the session's latest epoch, or before the first epoch the view its workflow names. */
export function activePhaseView(plugins: WebPlugin[], state: SessionState): { phase: string | undefined; view: PhaseView | undefined } {
  const workflow = state.session.workflow;
  const phase = state.epochs.at(-1)?.phase ?? (workflow === null ? undefined : plugins.find((plugin) => plugin.workflowPhase && Object.hasOwn(plugin.workflowPhase, workflow))?.workflowPhase![workflow]);
  const view = phase === undefined ? undefined : plugins.find((plugin) => Object.hasOwn(plugin.phaseViews, phase))?.phaseViews[phase];
  return { phase, view };
}

/** The session views available for `state`, and the one `wanted` names when it is available (null: the phase view). */
export function sessionViews(plugins: WebPlugin[], state: SessionState, wanted: string | null): { available: PluginSessionView[]; active: PluginSessionView | null } {
  const available = plugins.flatMap((plugin) => plugin.sessionViews ?? []).filter((view) => view.available(state));
  return { available, active: available.find((view) => view.id === wanted) ?? null };
}

const NO_MODELS = { default: { backend: "claude", model: "", effort: "" }, backends: { claude: { error: "" }, codex: { error: "" } } } as ModelsResponse;

/** Props for a phase view that renders a snapshot (fixture, static export): no models, no drafts, nothing to send. */
export function readOnlyViewProps(state: SessionState): PhaseViewProps {
  return { state, models: NO_MODELS, drafts: [], epoch: null, readOnly: true, onSent() {}, onDiscard() {}, onOpenAside() {} };
}
