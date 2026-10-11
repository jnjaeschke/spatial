import type { InvestigationData, InvestigationLocation } from "../shared/types.ts";
import type { DiagramNodeData } from "../../../web/graph-api.ts";
import type { Artifact, SessionState } from "../../../web/plugin-api.ts";
import { SATELLITE_WIDTH, latestStart, lines, rootGraph, type Draft, type Graph, type GraphNodeData } from "../../../web/graph-api.ts";

export interface InvestigationNodeData { kind: "investigation"; investigationId: string; sessionId: string; data: InvestigationData }
export interface LocationNodeData { kind: "location"; anchor: string; location: InvestigationLocation; searchfox: { repoBase: string; rev: string } | null }

export const latestInvestigation = (state: SessionState) => state.artifacts.findLast((a) => a.type === "Investigation") as Artifact<InvestigationData> | undefined;

/** The investigate view: the Investigation (plan, questions, what was tried) with its locations around it and the request beside it; chats anchor on the card, a location (`<id>#loc<n>`) or a step (`<id>#step<n>`). Before the investigation exists only the request shows. */
export function investigationGraph(state: SessionState, drafts: Draft[]): Graph | null {
  const start = latestStart(state);
  if (!start) return null;
  const investigation = latestInvestigation(state);
  const nodes: Graph["nodes"] = [];
  const edges: Graph["edges"] = [];
  if (investigation) {
    nodes.push({ id: investigation.id, data: { kind: "investigation", investigationId: investigation.id, sessionId: state.session.id, data: investigation.data } satisfies InvestigationNodeData });
    investigation.data.locations.forEach((location, index) => {
      const id = `${investigation.id}#loc${index}`;
      nodes.push({ id, anchors: [investigation.id], data: { kind: "location", anchor: id, location, searchfox: state.searchfox ? { repoBase: state.searchfox.repoBase, rev: state.searchfox.tipRev } : null } satisfies LocationNodeData });
      edges.push({ id: `${id}->${investigation.id}`, source: id, target: investigation.id });
    });
    if (investigation.data.diagram) {
      const id = `${investigation.id}#diagram`;
      nodes.push({ id, anchors: [investigation.id], data: { kind: "diagram", diagram: { ...investigation, id, type: "Diagram", data: investigation.data.diagram }, closable: true } satisfies DiagramNodeData });
      edges.push({ id: `${id}->${investigation.id}`, source: id, target: investigation.id });
    }
  }
  return rootGraph(state, drafts, { nodes, edges, anchorOn: investigation?.id, resolveSub: (anchor) => investigation && anchor.startsWith(`${investigation.id}#`) ? investigation.id : null });
}

const INVESTIGATION_WIDTH = 760;

export function investigationSize(data: GraphNodeData): { width: number; height: number } {
  if (data.kind === "investigation") {
    const d = (data as unknown as InvestigationNodeData).data;
    return { width: INVESTIGATION_WIDTH, height: 170 + lines(d.summary, 60) * 22 + d.steps.length * 56 + d.openQuestions.length * 26 + d.testCases.length * 40 + (d.exploration.length ? 60 + d.exploration.length * 40 : 0) };
  }
  if (data.kind === "location") return { width: SATELLITE_WIDTH, height: 110 + lines((data as unknown as LocationNodeData).location.why, 50) * 20 };
  throw new Error(`No size for node kind: ${data.kind}`);
}
