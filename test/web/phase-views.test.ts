import { test } from "node:test";
import assert from "node:assert/strict";
import { activePhaseView, sessionViews } from "../../src/web/phase-views.ts";
import type { PhaseView, PluginSessionView, WebPlugin } from "../../src/web/plugin-api.ts";
import type { Epoch, SessionState } from "../../src/shared/types.ts";

const view = (name: string) => ({ Body: () => name }) as unknown as PhaseView;
const investigate = view("investigate"), review = view("review");
const plugins: WebPlugin[] = [
  { id: "a", phaseViews: { investigate }, workflowPhase: { implement: "investigate" } },
  { id: "b", phaseViews: { review } },
];
const state = (workflow: string | null, phases: string[]) => ({
  session: { workflow }, epochs: phases.map((phase, i) => ({ n: i + 1, phase }) as Epoch),
}) as SessionState;

test("the latest epoch's phase picks the view from any plugin; before the first epoch the workflow names it", () => {
  assert.deepEqual(activePhaseView(plugins, state("implement", ["investigate", "review"])), { phase: "review", view: review });
  assert.deepEqual(activePhaseView(plugins, state("implement", [])), { phase: "investigate", view: investigate });
  assert.deepEqual(activePhaseView(plugins, state("implement", ["build"])), { phase: "build", view: undefined });
  assert.deepEqual(activePhaseView(plugins, state(null, [])), { phase: undefined, view: undefined });
});

test("sessionViews lists the available views and picks the wanted one if available", () => {
  const spec = { id: "spec", label: "Spec explorer", available: (s: SessionState) => s.artifacts.length > 0, Body: () => null } as unknown as PluginSessionView;
  const withViews: WebPlugin[] = [...plugins, { id: "c", phaseViews: {}, sessionViews: [spec] }];
  const empty = { ...state("review", ["review"]), artifacts: [] } as SessionState;
  const full = { ...state("review", ["review"]), artifacts: [{}] } as SessionState;
  assert.deepEqual(sessionViews(withViews, empty, "spec"), { available: [], active: null });
  assert.deepEqual(sessionViews(withViews, full, "spec"), { available: [spec], active: spec });
  assert.deepEqual(sessionViews(withViews, full, null), { available: [spec], active: null });
});
