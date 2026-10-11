import { useAction, ErrorText } from "../../../web/plugin-api.ts";
import type { SummaryView } from "../runtime/summaries.ts";

/** An algorithm's summary: AI-written clauses with step citations (hovering a clause highlights its steps) and Flag; or a quiet note when there is none. */
export function SummaryBlock({ view, onHover, onFlag }: { view: SummaryView | undefined; onHover(steps: string[]): void; onFlag: (() => Promise<void>) | null }) {
  const action = useAction();
  if (!view || view.state === "absent") return null;
  if (view.state !== "ready") return <p className="spec-no-summary" data-testid="spec-no-summary">No summary</p>;
  return <div className="spec-summary" data-testid="spec-summary">
    <span className="badge">AI-written</span>
    <ol>{view.clauses.map((clause, index) => <li key={index} onMouseEnter={() => onHover(clause.steps)} onMouseLeave={() => onHover([])}>{clause.text} <span className="spec-cites">{clause.steps.map((step) => `§${step}`).join(" ")}</span></li>)}</ol>
    {onFlag && <button type="button" className="link-button" disabled={action.busy} onClick={() => void action.run(onFlag)}>Flag</button>}
    <ErrorText error={action.error} />
  </div>;
}
