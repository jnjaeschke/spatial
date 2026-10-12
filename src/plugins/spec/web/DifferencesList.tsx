import { ErrorText, IconButton, useAction } from "../../../web/plugin-api.ts";
import type { EngineDifference, ImplementationsData } from "../shared/types.ts";
import { compareEnabled } from "./implementations.ts";
import { specClient } from "./client.ts";

function DifferenceItem({ sessionId, data, entryId, difference, readOnly, onHover }: { sessionId: string; data: ImplementationsData; entryId: string; difference: EngineDifference & { index: number }; readOnly: boolean; onHover(difference: (EngineDifference & { index: number }) | null): void }) {
  const action = useAction();
  return <li className="impl-difference" data-testid="impl-difference" onMouseEnter={() => onHover(difference)} onMouseLeave={() => onHover(null)}>
    <span className="badge">AI-written</span> <span className="impl-note">{difference.kind}</span> {difference.summary} <span className="impl-note">{difference.steps.map((step) => `§${step}`).join(" ")}</span>
    <ul>{difference.claims.map((claim, index) => <li key={index}><strong>{claim.engine}</strong>: {claim.text}</li>)}</ul>
    {!readOnly && <IconButton type="button" className="link-button" label={`Flag difference ${difference.index + 1}`} disabled={action.busy} onClick={() => void action.run(() => specClient.flagDifference(sessionId, data.ref, entryId, difference.index))}>Flag</IconButton>}
    <ErrorText error={action.error} />
  </li>;
}

/** Compare, and the verified differences between the engines: AI-written, each flaggable; hovering one highlights its steps and code. `failed`: the error of the latest comparison run. */
export function DifferencesList({ sessionId, data, readOnly, running, failed, onHover }: { sessionId: string; data: ImplementationsData; readOnly: boolean; running: boolean; failed: string | null; onHover(difference: (EngineDifference & { index: number }) | null): void }) {
  const action = useAction();
  const { comparison } = data;
  const enabled = compareEnabled(data.mappings);
  if (!enabled && comparison.state === "absent") return null;
  return <section className="impl-differences" data-testid="impl-differences">
    <header className="impl-differences-head"><strong>Differences</strong>
      {comparison.state === "ready" && <span className="impl-note">{comparison.dropped} dropped by verification{comparison.flagged ? `, ${comparison.flagged} flagged` : ""}{comparison.outdated ? " · outdated" : ""}</span>}
      {!readOnly && enabled && <button type="button" disabled={action.busy || running} onClick={() => void action.run(() => specClient.compareEngines(sessionId, data.ref))}>{comparison.state === "ready" && comparison.outdated ? "Compare again" : "Compare"}</button>}
      {running && <span className="impl-note">comparing…</span>}
    </header>
    <ErrorText error={action.error ?? failed} />
    {comparison.state === "ready" && (comparison.differences.length ? <ol>{comparison.differences.map((difference) => <DifferenceItem key={difference.index} sessionId={sessionId} data={data} entryId={comparison.entryId} difference={difference} readOnly={readOnly} onHover={onHover} />)}</ol> : <p className="empty">No verified differences</p>)}
  </section>;
}
