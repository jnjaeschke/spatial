import type { ChangeNodeData } from "../plugins/review/web/graph.ts";
import { InlineText } from "./InlineText.tsx";

export function GuideBar({ steps, step, start, canToggle, onMove, onToggle }: {
  steps: ChangeNodeData[];
  step: number | null;
  start: number;
  canToggle: boolean;
  onMove(delta: 1 | -1): void;
  onToggle(): void;
}) {
  const shown = steps[step ?? start]!;
  const reviewed = steps.filter((s) => s.reviewed).length;
  return <div className="guide-bar" data-testid="guide">
    <button aria-label="Previous step" onClick={() => onMove(-1)}>‹ Prev</button>
    <span className="guide-step">{step === null ? "Start here:" : `Step ${step + 1}/${steps.length}`}{shown.commit !== null && <span className="commit-tag">C{shown.commit + 1}</span>} <InlineText text={shown.change.title} /></span>
    <button aria-label="Next step" onClick={() => onMove(1)}>Next ›</button>
    <button aria-label="Toggle reviewed" disabled={step === null || !canToggle} onClick={onToggle}>{shown.reviewed ? "Unmark reviewed" : "Mark reviewed"}</button>
    <span className="guide-progress" data-testid="guide-progress">{reviewed}/{steps.length} reviewed</span>
  </div>;
}
