import { useContext, useState } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { DiagramNodeData } from "../graph.ts";
import { Box, ClosedContext, DiagramStepContext, SequenceDiagram, type SequenceArrow } from "../plugin-api.ts";

export type DiagramFlowNode = Node<Record<string, unknown> & DiagramNodeData, "diagram">;

export function DiagramNode({ data }: NodeProps<DiagramFlowNode>) {
  const { diagram } = data;
  const closer = useContext(ClosedContext);
  const diagramSteps = useContext(DiagramStepContext);
  const collapseId = `diagram:${diagram.id}`;
  const [showBefore, setShowBefore] = useState(false);
  const steps = showBefore ? diagram.data.before ?? diagram.data.steps : diagram.data.steps;
  const unverified = steps.filter((step) => !step.verified).length;
  const arrows = steps.map((step, index): SequenceArrow => {
    const cite = `${step.cite.path}:${step.cite.line}`;
    const onStep = !showBefore ? diagramSteps?.onStep(diagram, step) ?? null : null;
    return {
      from: step.from,
      to: step.to,
      phase: step.phase,
      title: `${step.verified ? cite : `citation not found near ${cite}`}${step.text ? ` — ${step.text}` : ""}`,
      data: { "data-status": step.status, "data-verified": String(step.verified) },
      label: <div className="sequence-label">
        {step.guard && <span className="sequence-guard">[{step.guard}]</span>}
        <span className="sequence-badge">{index + 1}</span><code className="sequence-call">{step.call}</code>
        {!step.verified && <span className="sequence-warning">⚠</span>}
        <span className="sequence-what">{step.what}</span>
        {step.when && <span className="sequence-when">{step.when}</span>}
      </div>,
      ...(onStep ? { onClick: onStep } : {}),
    };
  });
  const head = <>
    <div className="diagram-summary">{diagram.data.summary}</div>
    {diagram.data.before && <button className="diagram-toggle nodrag" aria-pressed={showBefore} onClick={() => setShowBefore(!showBefore)}>Show flow {showBefore ? "after" : "before"} this commit</button>}
  </>;
  return <Box kind="diagram" testId={`diagram-${diagram.id}`} handles={{ target: Position.Top, source: Position.Bottom }} title={<>Sequence — {diagram.data.title}<span className="diagram-counts">{steps.length} steps · {unverified} unverified</span></>} collapse={{ key: collapseId, closedWithoutContext: true }} stub={head} onClose={closer ? () => closer.close(diagram.id) : undefined}>
    {head}
    <SequenceDiagram title={diagram.data.title} lanes={diagram.data.lanes} steps={arrows} />
  </Box>;
}
