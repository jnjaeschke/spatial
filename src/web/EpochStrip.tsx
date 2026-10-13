import type { SessionState } from "../shared/types.ts";
import { epochChips } from "./epochs.ts";

const MARK = { running: "…", succeeded: "✓", failed: "✗", cancelled: "⊘" } as const;

/** One chip per epoch (`#n phase status → decision`); clicking shows that epoch's phase view, the latest one is the live view. */
export function EpochStrip({ state, viewed, onView, labels }: { state: SessionState; viewed: number | null; onView(n: number | null): void; labels?: Record<number, string> }) {
  const latest = state.epochs.at(-1)?.n;
  return <nav className="epoch-strip" data-testid="epoch-strip" aria-label="Epochs">
    {epochChips(state).map((chip) => <button key={chip.n} type="button" data-testid={`epoch-chip-${chip.n}`} data-status={chip.status} className={`epoch-chip ${chip.status}`} aria-pressed={(viewed ?? latest) === chip.n} onClick={() => onView(chip.n === latest ? null : chip.n)}>
      #{chip.n} {labels?.[chip.n] ?? chip.phase} {MARK[chip.status]}{chip.decision ? ` → ${chip.decision}` : ""}
    </button>)}
  </nav>;
}
