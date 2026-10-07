import dagre from "@dagrejs/dagre";
import { useContext, useMemo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { DiagramNodeData, ZoomLevel } from "../graph.ts";
import { CollapseContext } from "../collapse.ts";

export type DiagramFlowNode = Node<Record<string, unknown> & DiagramNodeData & { level: ZoomLevel }, "diagram">;

const BOX_W = 156;
const BOX_H = 54;

function diagramLayout(data: DiagramNodeData["diagram"]["data"]) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: data.mode === "flow" ? "LR" : "TB", nodesep: 24, ranksep: 44, marginx: 12, marginy: 12 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of data.nodes) graph.setNode(node.id, { width: BOX_W, height: BOX_H });
  for (const edge of data.edges) if (graph.hasNode(edge.from) && graph.hasNode(edge.to)) graph.setEdge(edge.from, edge.to, { label: edge.kind });
  dagre.layout(graph);
  return { graph, width: graph.graph().width ?? BOX_W, height: graph.graph().height ?? BOX_H };
}

export function DiagramNode({ data }: NodeProps<DiagramFlowNode>) {
  const { diagram } = data;
  const collapse = useContext(CollapseContext);
  const collapseId = `diagram:${diagram.id}`;
  const closed = collapse?.collapsed.has(collapseId) ?? true;
  const unverified = diagram.data.nodes.filter((node) => !node.verified).length + diagram.data.edges.filter((edge) => !edge.verified).length;
  const { graph, width, height } = useMemo(() => diagramLayout(diagram.data), [diagram]);
  return <div className={`node diagram-node level-${data.level}`} data-testid={`diagram-${diagram.id}`}>
    <Handle type="target" position={Position.Top} />
    <div className="title">Structure — {diagram.data.title}<span className="diagram-mode">{diagram.data.mode}</span><span className="diagram-counts">{diagram.data.nodes.length} entities · {unverified} unverified</span>{collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(collapseId)}>{closed ? "▸" : "▾"}</button>}</div>
    {!closed && <div className="diagram-content nodrag nopan">
      <svg role="img" aria-label={`Structure diagram: ${diagram.data.title}`} width={width} height={height}>
        <defs><marker id={`diagram-arrow-${diagram.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker></defs>
        {diagram.data.edges.map((edge, index) => {
          const from = graph.node(edge.from), to = graph.node(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + (diagram.data.mode === "flow" ? BOX_W / 2 : 0), y1 = from.y + (diagram.data.mode === "flow" ? 0 : BOX_H / 2);
          const x2 = to.x - (diagram.data.mode === "flow" ? BOX_W / 2 : 0), y2 = to.y - (diagram.data.mode === "flow" ? 0 : BOX_H / 2);
          return <g key={`${edge.from}-${edge.to}-${index}`} className="diagram-edge" data-verified={String(edge.verified)}>
            <title>{edge.verified ? "" : `citation not found at ${edge.cite.path}:${edge.cite.line}`}</title>
            <path d={`M${x1} ${y1} L${x2} ${y2}`} strokeDasharray={edge.verified ? undefined : "5 4"} markerEnd={`url(#diagram-arrow-${diagram.id})`} />
            <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5}>{diagram.data.mode === "flow" && edge.step !== null ? `${edge.step}. ` : ""}{edge.kind}</text>
          </g>;
        })}
        {diagram.data.nodes.map((node) => {
          const point = graph.node(node.id);
          return <g key={node.id} className={`diagram-entity status-${node.status}`} data-verified={String(node.verified)} transform={`translate(${point.x - BOX_W / 2},${point.y - BOX_H / 2})`}>
            <title>{node.cite.path}:{node.cite.line}</title>
            <rect width={BOX_W} height={BOX_H} rx="8" strokeDasharray={node.verified ? undefined : "5 4"} />
            <text x={BOX_W / 2} y="23" className="diagram-label">{node.label}</text>
            <text x={BOX_W / 2} y="41" className="diagram-kind">{node.kind}</text>
          </g>;
        })}
      </svg>
    </div>}
    <Handle type="source" position={Position.Bottom} />
  </div>;
}
