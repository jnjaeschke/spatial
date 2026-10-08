import type { InvestigationData, InvestigationLocation } from "../shared/types.ts";
import type { DiagramNodeData } from "../../review/web/api.ts";
import type { Artifact, Ref, SessionState } from "../../../web/plugin-api.ts";
import { NODE_WIDTH, SATELLITE_WIDTH, addChats, addNotes, conversationNode, latestStart, lines, rootThread, type Draft, type Graph, type GraphNodeData, type ZoomLevel } from "../../../web/graph-api.ts";

export interface InvestigationNodeData { kind: "investigation"; investigationId: string; sessionId: string; data: InvestigationData }
export interface LocationNodeData { kind: "location"; anchor: string; location: InvestigationLocation; searchfox: { repoBase: string; rev: string } | null }

export const latestInvestigation = (state: SessionState) => state.artifacts.findLast((a) => a.type === "Investigation") as Artifact<InvestigationData> | undefined;

/** The investigate view: the Investigation (plan, questions, what was tried) with its locations around it and the request beside it; chats anchor on the card, a location (`<id>#loc<n>`) or a step (`<id>#step<n>`). Before the investigation exists only the request shows. */
export function investigationGraph(state: SessionState, drafts: Draft[]): Graph | null {
  const start = latestStart(state);
  if (!start) return null;
  const root = rootThread(state, start.id);
  const investigation = latestInvestigation(state);
  const g: Graph = { nodes: [], edges: [] };
  const nodeIds = new Set<string>();
  if (investigation) {
    g.nodes.push({ id: investigation.id, data: { kind: "investigation", investigationId: investigation.id, sessionId: state.session.id, data: investigation.data } satisfies InvestigationNodeData });
    nodeIds.add(investigation.id);
  }
  g.nodes.push(conversationNode(state, start, root, investigation ? [investigation.id] : undefined));
  nodeIds.add(start.id);
  if (investigation) {
    g.edges.push({ id: `${start.id}->${investigation.id}`, source: start.id, target: investigation.id });
    investigation.data.locations.forEach((location, index) => {
      const id = `${investigation.id}#loc${index}`;
      g.nodes.push({ id, anchors: [investigation.id], data: { kind: "location", anchor: id, location, searchfox: state.searchfox ? { repoBase: state.searchfox.repoBase, rev: state.searchfox.tipRev } : null } satisfies LocationNodeData });
      g.edges.push({ id: `${id}->${investigation.id}`, source: id, target: investigation.id });
      nodeIds.add(id);
    });
    if (investigation.data.diagram) {
      const id = `${investigation.id}#diagram`;
      g.nodes.push({ id, anchors: [investigation.id], data: { kind: "diagram", diagram: { ...investigation, id, type: "Diagram", data: investigation.data.diagram }, closable: true } satisfies DiagramNodeData });
      g.edges.push({ id: `${id}->${investigation.id}`, source: id, target: investigation.id });
      nodeIds.add(id);
    }
  }
  const hostOf = new Map(root ? [[root.id, start.id]] : []);
  const resolve = (anchor: Ref) => {
    const direct = nodeIds.has(anchor) || hostOf.has(anchor) ? anchor
      : investigation && anchor.startsWith(`${investigation.id}#`) ? investigation.id
        : state.links.find((l) => l.kind === "reply" && l.from === anchor)?.to;
    const host = direct && (hostOf.get(direct) ?? direct);
    return host && nodeIds.has(host) ? host : null;
  };
  addNotes(g, state, nodeIds);
  addChats(g, state, drafts, hostOf, nodeIds, resolve, "", []);
  return g;
}

export function investigationSize(data: GraphNodeData, level: ZoomLevel): { width: number; height: number } {
  if (data.kind === "investigation") {
    const d = (data as unknown as InvestigationNodeData).data;
    return { width: NODE_WIDTH[level], height: 170 + lines(d.summary, 60) * 22 + d.steps.length * 56 + d.openQuestions.length * 26 + d.testCases.length * 40 + (d.exploration.length ? 60 + d.exploration.length * 40 : 0) };
  }
  if (data.kind === "location") return { width: SATELLITE_WIDTH, height: 110 + lines((data as unknown as LocationNodeData).location.why, 50) * 20 };
  throw new Error(`No size for node kind: ${data.kind}`);
}
