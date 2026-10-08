import { useState } from "react";
import { api, type Epoch } from "../../../web/plugin-api.ts";

/** The failure of the shown epoch, with Retry (reruns the epoch and continues the workflow); nothing for a past epoch. */
export function RunStatus({ sessionId, epoch, readOnly }: { sessionId: string; epoch: Epoch | null; readOnly: boolean }) {
  const [error, setError] = useState<string | null>(null);
  if (!epoch || readOnly || (epoch.status !== "failed" && epoch.status !== "cancelled")) return null;
  return <div className="run-status failed" data-testid="run-status">
    Epoch {epoch.n} ({epoch.phase}) {epoch.status}{epoch.error ? `: ${epoch.error}` : ""}{" "}
    <button type="button" data-testid="retry-epoch" onClick={() => { setError(null); api.retry(sessionId).catch((e: Error) => setError(e.message)); }}>Retry</button>
    {error && <span> {error}</span>}
  </div>;
}
