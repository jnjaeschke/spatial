import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import type { SequenceLane } from "../shared/types.ts";
import { sequenceLayout } from "./sequence-layout.ts";

/** One arrow of a sequence diagram from lane `from` to lane `to` (equal for a self step); `label` renders above the arrow; with `onClick` the step is a button. */
export interface SequenceArrow { from: string; to: string; label: ReactNode; phase?: string | null; title?: string; data?: Record<`data-${string}`, string>; onClick?(): void }

/** Lanes with lifelines, a phase row before each phase, and one row per arrow. */
export function SequenceDiagram({ title, lanes, steps }: { title: string; lanes: SequenceLane[]; steps: SequenceArrow[] }) {
  const layout = useMemo(() => sequenceLayout(lanes.map((lane) => lane.id), steps), [lanes, steps]);
  return <div className="diagram-content nodrag nopan">
    <div className="sequence-diagram" role="group" aria-label={`Sequence diagram: ${title}`} style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(180px, 1fr))` }}>
      {lanes.map((lane, index) => <Fragment key={lane.id}><div className="sequence-lane" style={{ gridColumn: index + 1, gridRow: 1 }}><strong>{lane.label}</strong>{lane.note && <small>{lane.note}</small>}</div><i className="sequence-lifeline" style={{ gridColumn: index + 1, gridRow: `2 / span ${layout.rowCount - 1}` }} /></Fragment>)}
      {steps.map((step, index) => {
        const cell = layout.cells[index]!;
        const props = { className: `sequence-step ${cell.direction}${step.onClick ? " clickable nodrag nopan" : ""}`, ...step.data, title: step.title, style: { gridColumn: `${cell.firstLane + 1} / ${cell.lastLane + 2}`, gridRow: cell.stepRow, "--sequence-span": cell.lastLane - cell.firstLane + 1, "--sequence-loop": cell.loopAt } as CSSProperties };
        const body = <>{step.label}<span className="sequence-arrow" /></>;
        return <Fragment key={index}>
          {cell.phaseRow !== null && <div className="sequence-phase" style={{ gridColumn: "1 / -1", gridRow: cell.phaseRow }}>{step.phase}</div>}
          {step.onClick ? <button type="button" {...props} onClick={step.onClick}>{body}</button> : <div {...props}>{body}</div>}
        </Fragment>;
      })}
    </div>
  </div>;
}
