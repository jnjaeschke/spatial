import type { InvestigationData, InvestigationLocation, InvestigationStep } from "../shared/types.ts";
import type { DiagramNodeData } from "../../../web/graph-api.ts";
import type { Artifact, SessionState } from "../../../web/plugin-api.ts";
import { SATELLITE_WIDTH, lines, rootGraph, type Draft, type Graph, type GraphNodeData } from "../../../web/graph-api.ts";

export interface InvestigationNodeData { kind: "investigation"; investigationId: string; sessionId: string; data: InvestigationData }
export interface InvestigationStepNodeData { kind: "investigation-step"; investigationId: string; index: number; step: InvestigationStep }
export interface InvestigationTestsNodeData { kind: "investigation-tests"; investigationId: string; testCases: InvestigationData["testCases"] }
export interface InvestigationQuestionsNodeData { kind: "investigation-questions"; investigationId: string; questions: string[] }
export interface LocationNodeData { kind: "location"; anchor: string; location: InvestigationLocation; searchfox: { repoBase: string; rev: string } | null }

export const latestInvestigation = (state: SessionState) => state.artifacts.findLast((a) => a.type === "Investigation") as Artifact<InvestigationData> | undefined;

/** The investigate view: the Investigation as a header (summary, details), a chain of step nodes, locations on their step, tests, questions and diagram around them. Chats anchor on any of these nodes; an unknown sub-anchor resolves to the header. Null before the investigation exists. */
export function investigationGraph(state: SessionState, drafts: Draft[]): Graph | null {
  const investigation = latestInvestigation(state);
  if (!investigation) return null;
  const { id, data } = investigation;
  const nodes: Graph["nodes"] = [{ id, data: { kind: "investigation", investigationId: id, sessionId: state.session.id, data } satisfies InvestigationNodeData }];
  const edges: Graph["edges"] = [];
  const link = (from: string, to: string) => edges.push({ id: `${from}->${to}`, source: from, target: to });
  data.steps.forEach((step, index) => {
    const stepId = `${id}#step${index}`;
    nodes.push({ id: stepId, data: { kind: "investigation-step", investigationId: id, index, step } satisfies InvestigationStepNodeData });
    link(index === 0 ? id : `${id}#step${index - 1}`, stepId);
  });
  data.locations.forEach((location, index) => {
    const locationId = `${id}#loc${index}`;
    const on = location.step === null ? id : `${id}#step${location.step}`;
    nodes.push({ id: locationId, anchors: [on], data: { kind: "location", anchor: locationId, location, searchfox: state.searchfox ? { repoBase: state.searchfox.repoBase, rev: state.searchfox.tipRev } : null } satisfies LocationNodeData });
    link(locationId, on);
  });
  if (data.testCases.length) {
    nodes.push({ id: `${id}#tests`, anchors: [id], data: { kind: "investigation-tests", investigationId: id, testCases: data.testCases } satisfies InvestigationTestsNodeData });
    link(`${id}#tests`, id);
  }
  if (data.openQuestions.length) {
    nodes.push({ id: `${id}#questions`, anchors: [id], data: { kind: "investigation-questions", investigationId: id, questions: data.openQuestions } satisfies InvestigationQuestionsNodeData });
    link(`${id}#questions`, id);
  }
  if (data.diagram) {
    const diagramId = `${id}#diagram`;
    nodes.push({ id: diagramId, anchors: [id], data: { kind: "diagram", diagram: { ...investigation, id: diagramId, type: "Diagram", data: data.diagram }, closable: true } satisfies DiagramNodeData });
    link(diagramId, id);
  }
  return rootGraph(state, drafts, { nodes, edges, resolveSub: (anchor) => anchor.startsWith(`${id}#`) ? id : state.links.find((l) => l.kind === "reply" && l.from === anchor)?.to ?? null });
}

/** The tests node starts collapsed. */
export const investigationCollapsedByDefault = (graph: Graph) => graph.nodes.filter((node) => node.data.kind === "investigation-tests").map((node) => node.id);

const INVESTIGATION_WIDTH = 760;

export function investigationSize(data: GraphNodeData): { width: number; height: number } {
  if (data.kind === "investigation") {
    const d = (data as unknown as InvestigationNodeData).data;
    return { width: INVESTIGATION_WIDTH, height: 130 + Math.min(lines(d.summary, 90), 3) * 22 };
  }
  if (data.kind === "investigation-step") {
    const { step } = data as unknown as InvestigationStepNodeData;
    return { width: INVESTIGATION_WIDTH, height: 110 + Math.min(lines(step.intent, 90), 3) * 22 + step.checks.length * 24 };
  }
  if (data.kind === "investigation-tests") return { width: SATELLITE_WIDTH, height: 50 + (data as unknown as InvestigationTestsNodeData).testCases.length * 60 };
  if (data.kind === "investigation-questions") return { width: SATELLITE_WIDTH, height: 70 + (data as unknown as InvestigationQuestionsNodeData).questions.reduce((total, q) => total + lines(q, 50) * 22, 0) };
  if (data.kind === "location") return { width: SATELLITE_WIDTH, height: 110 + lines((data as unknown as LocationNodeData).location.why, 50) * 20 };
  throw new Error(`No size for node kind: ${data.kind}`);
}
