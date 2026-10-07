import { useContext, useMemo, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { DiagramNodeData, ZoomLevel } from "../graph.ts";
import { CollapseContext } from "../collapse.ts";

export type DiagramFlowNode = Node<Record<string, unknown> & DiagramNodeData & { level: ZoomLevel }, "diagram">;

const LANE_W = 170;
const ROW_H = 92;

export function DiagramNode({ data }: NodeProps<DiagramFlowNode>) {
  const { diagram } = data;
  const collapse = useContext(CollapseContext);
  const collapseId = `diagram:${diagram.id}`;
  const closed = collapse?.collapsed.has(collapseId) ?? true;
  const [showBefore, setShowBefore] = useState(false);
  const steps = showBefore ? diagram.data.before ?? diagram.data.steps : diagram.data.steps;
  const unverified = steps.filter((step) => !step.verified).length;
  const width = Math.max(360, diagram.data.lanes.length * LANE_W);
  const height = 100 + steps.length * ROW_H;
  const groups = useMemo(() => {
    let phase: string | null | undefined;
    return steps.map((step, index) => {
      const startsPhase = step.phase !== phase;
      phase = step.phase;
      return { step, index, startsPhase };
    });
  }, [steps]);
  return <div className={`node diagram-node level-${data.level}`} data-testid={`diagram-${diagram.id}`}>
    <Handle type="target" position={Position.Top} />
    <div className="title">Sequence — {diagram.data.title}<span className="diagram-counts">{steps.length} steps · {unverified} unverified</span>{collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(collapseId)}>{closed ? "▸" : "▾"}</button>}</div>
    <div className="diagram-summary">{diagram.data.summary}</div>
    {diagram.data.before && <button className="diagram-toggle nodrag" aria-pressed={showBefore} onClick={() => setShowBefore(!showBefore)}>Show flow {showBefore ? "after" : "before"} this commit</button>}
    {!closed && <div className="diagram-content nodrag nopan">
      <div className="sequence-diagram" role="img" aria-label={`Sequence diagram: ${diagram.data.title}`} style={{ width, height }}>
        <div className="sequence-lanes">{diagram.data.lanes.map((lane, index) => <div className="sequence-lane" key={lane.id} style={{ left: index * LANE_W, width: LANE_W }}><strong>{lane.label}</strong>{lane.note && <small>{lane.note}</small>}<i /></div>)}</div>
        {groups.map(({ step, index, startsPhase }) => {
          const from = diagram.data.lanes.findIndex((lane) => lane.id === step.from);
          const to = diagram.data.lanes.findIndex((lane) => lane.id === step.to);
          const y = 68 + index * ROW_H;
          const x1 = from * LANE_W + LANE_W / 2, x2 = to * LANE_W + LANE_W / 2;
          return <div className="sequence-row" key={`${step.cite.path}:${step.cite.line}:${index}`}>
            {startsPhase && step.phase && <div className="sequence-phase" style={{ top: y - 20 }}>{step.phase}</div>}
            <div className="sequence-step" data-status={step.status} data-verified={String(step.verified)} style={{ top: y, left: Math.min(x1, x2), width: Math.max(LANE_W, Math.abs(x2 - x1)) }} title={step.verified ? `${step.cite.path}:${step.cite.line}` : `citation not found near ${step.cite.path}:${step.cite.line}`}>
              <span className="sequence-badge">{index + 1}</span>{step.guard && <span className="sequence-guard">[{step.guard}]</span>}
              <span className="sequence-call">{step.call}</span><span className="sequence-what">{step.what}{step.when ? ` · ${step.when}` : ""}</span>
              <span className="sequence-arrow" style={{ left: x1 <= x2 ? 0 : undefined, right: x1 > x2 ? 0 : undefined }}>{from === to ? "↻" : x1 <= x2 ? "→" : "←"}</span>
              {!step.verified && <span className="sequence-warning" title={`citation not found near ${step.cite.path}:${step.cite.line}`}>⚠</span>}
            </div>
          </div>;
        })}
      </div>
    </div>}
    <Handle type="source" position={Position.Bottom} />
  </div>;
}
