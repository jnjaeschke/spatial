import { reviewClient } from "./client.ts";
import { useState } from "react";
import { type ModelsResponse, type SessionState } from "../../../web/plugin-api.ts";
import { analysisStatus, retryBody } from "./analysis.ts";

export function AnalysisStatus({ state, models }: { state: SessionState; models: ModelsResponse }) {
  const status = analysisStatus(state);
  const [error, setError] = useState<string | null>(null);
  const body = retryBody(state, models.default);
  const message = status.state === "none" ? "This session has no review. Start one from the start screen."
    : status.state === "failed" ? `Analysis failed: ${status.error}`
      : status.step === "importRevision" ? "Fetching the revision…"
        : status.step === "reviewRange" ? "Reading the work tree…"
          : status.step === "importDiff" ? "Reading the commits…" : "Analyzing the patch…";
  return <div className="analysis" data-testid="analysis" data-state={status.state}>
    <span>{message}</span>{status.state === "failed" && body && <button onClick={() => reviewClient.narrate(state.session.id, body).catch((e: Error) => setError(e.message))}>Retry</button>}
    {error && <span className="failed">{error}</span>}
  </div>;
}
