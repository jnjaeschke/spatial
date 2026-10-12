import type { CheckResult } from "../shared/types.ts";

/** One row per acceptance check with its verdict; each proving command run opens through `onOpen`. */
export function CheckResultsList({ results, onOpen }: { results: CheckResult[]; onOpen(runId: string): void }) {
  if (results.length === 0) return null;
  return <ul className="check-results" data-testid="check-results">
    {results.map((r) => <li key={`${r.step}-${r.check}`} data-testid="check-result" data-ok={r.ok} className={`check-result ${r.ok ? "ok" : "fail"}`}>
      <span aria-hidden="true">{r.ok ? "✓" : "✗"}</span> <code>{r.label}</code> <span className="check-message">{r.message}</span>
      {r.runs.map((id, index) => <button key={id} type="button" className="check-run" data-testid="check-run" onClick={() => onOpen(id)}>run {index + 1}</button>)}
    </li>)}
  </ul>;
}
