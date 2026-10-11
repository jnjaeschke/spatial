import { Fragment, useContext, useMemo, useState } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { DiagramNodeData } from "../graph.ts";
import { Box, ClosedContext } from "../../../../web/plugin-api.ts";
import { DiagramStepContext } from "../canvas.tsx";

export type DiagramFlowNode = Node<Record<string, unknown> & DiagramNodeData, "diagram">;

export function DiagramNode({ data }: NodeProps<DiagramFlowNode>) {
  const { diagram } = data;
  const closer = useContext(ClosedContext);
  const diagramSteps = useContext(DiagramStepContext);
  const collapseId = `diagram:${diagram.id}`;
  const [showBefore, setShowBefore] = useState(false);
  const steps = showBefore ? diagram.data.before ?? diagram.data.steps : diagram.data.steps;
  const unverified = steps.filter((step) => !step.verified).length;
  const groups = useMemo(() => {
    let phase: string | null | undefined;
    return steps.map((step, index) => {
      const startsPhase = step.phase !== phase;
      phase = step.phase;
      return { step, index, startsPhase };
    });
  }, [steps]);
  const layout = useMemo(() => {
    let row = 2;
    const entries = groups.map((group) => {
      const phaseRow = group.startsPhase && group.step.phase ? row++ : null;
      return { ...group, phaseRow, stepRow: row++ };
    });
    return { entries, rowCount: row - 1 };
  }, [groups]);
  const head = <>
    <div className="diagram-summary">{diagram.data.summary}</div>
    {diagram.data.before && <button className="diagram-toggle nodrag" aria-pressed={showBefore} onClick={() => setShowBefore(!showBefore)}>Show flow {showBefore ? "after" : "before"} this commit</button>}
  </>;
  return <Box kind="diagram" testId={`diagram-${diagram.id}`} handles={{ target: Position.Top, source: Position.Bottom }} title={<>Sequence — {diagram.data.title}<span className="diagram-counts">{steps.length} steps · {unverified} unverified</span></>} collapse={{ key: collapseId, closedWithoutContext: true }} stub={head} onClose={closer ? () => closer.close(diagram.id) : undefined}>
    {head}
    <div className="diagram-content nodrag nopan">
      <div className="sequence-diagram" role="group" aria-label={`Sequence diagram: ${diagram.data.title}`} style={{ gridTemplateColumns: `repeat(${diagram.data.lanes.length}, minmax(180px, 1fr))` }}>
        {diagram.data.lanes.map((lane, index) => <Fragment key={lane.id}><div className="sequence-lane" style={{ gridColumn: index + 1, gridRow: 1 }}><strong>{lane.label}</strong>{lane.note && <small>{lane.note}</small>}</div><i className="sequence-lifeline" style={{ gridColumn: index + 1, gridRow: `2 / span ${layout.rowCount - 1}` }} /></Fragment>)}
        {layout.entries.map(({ step, index, phaseRow, stepRow }) => {
          const from = diagram.data.lanes.findIndex((lane) => lane.id === step.from);
          const to = diagram.data.lanes.findIndex((lane) => lane.id === step.to);
          // A self-call also takes the neighbouring lane, so its text is not squeezed into one column; its loop stays on its own lane.
          const lanes = diagram.data.lanes.length;
          const firstLane = from === to && from === lanes - 1 && lanes > 1 ? from - 1 : Math.min(from, to);
          const lastLane = from === to && from < lanes - 1 ? from + 1 : Math.max(from, to);
          const loopAt = from === to ? `${((from - firstLane) * 2 + 1) * 50 / (lastLane - firstLane + 1)}%` : undefined;
          const direction = from !== to ? from < to ? "right" : "left" : "self";
          const cite = `${step.cite.path}:${step.cite.line}`;
          const target = !showBefore ? diagramSteps?.stepTarget(diagram, step) ?? null : null;
          const stepProps = { className: `sequence-step ${direction}${target ? " clickable nodrag nopan" : ""}`, "data-status": step.status, "data-verified": String(step.verified), style: { gridColumn: `${firstLane + 1} / ${lastLane + 2}`, gridRow: stepRow, "--sequence-span": lastLane - firstLane + 1, "--sequence-loop": loopAt } as React.CSSProperties, title: `${step.verified ? cite : `citation not found near ${cite}`}${step.text ? ` — ${step.text}` : ""}` };
          const label = <><div className="sequence-label">
                {step.guard && <span className="sequence-guard">[{step.guard}]</span>}
                <span className="sequence-badge">{index + 1}</span><code className="sequence-call">{step.call}</code>
                {!step.verified && <span className="sequence-warning">⚠</span>}
                <span className="sequence-what">{step.what}</span>
                {step.when && <span className="sequence-when">{step.when}</span>}
              </div>
              <span className="sequence-arrow" /></>;
          return <Fragment key={`${cite}:${index}`}>
            {phaseRow !== null && <div className="sequence-phase" style={{ gridColumn: "1 / -1", gridRow: phaseRow }}>{step.phase}</div>}
            {target ? <button {...stepProps} onClick={() => diagramSteps?.revealStep(target.changeNodeId, target.hunkId, target.row)}>{label}</button> : <div {...stepProps}>{label}</div>}
          </Fragment>;
        })}
      </div>
    </div>
  </Box>;
}
