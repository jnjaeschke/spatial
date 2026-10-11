import { IconButton } from "./IconButton.tsx";
import type { GuideStep } from "./Canvas.tsx";
import { InlineText } from "./InlineText.tsx";

export function GuideBar({ steps, step, start, canToggle, onMove, onToggle }: {
  steps: GuideStep[];
  step: number | null;
  start: number;
  canToggle: boolean;
  onMove(delta: 1 | -1): void;
  onToggle(): void;
}) {
  const shown = steps[step ?? start]!;
  const reviewed = steps.filter((s) => s.reviewed).length;
  return <div className="guide-bar" data-testid="guide">
    <IconButton label="Previous step" onClick={() => onMove(-1)}>‹ Prev</IconButton>
    <span className="guide-step">{step === null ? "Start here:" : `Step ${step + 1}/${steps.length}`}{shown.tag !== undefined && <span className="commit-tag">{shown.tag}</span>} <InlineText text={shown.title} /></span>
    <IconButton label="Next step" onClick={() => onMove(1)}>Next ›</IconButton>
    {shown.toggleReviewed && <IconButton label="Toggle reviewed" disabled={step === null || !canToggle} onClick={onToggle}>{shown.reviewed ? "Unmark reviewed" : "Mark reviewed"}</IconButton>}
    <span className="guide-progress" data-testid="guide-progress">{reviewed}/{steps.length} reviewed</span>
  </div>;
}
