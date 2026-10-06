import { useState } from "react";
import type { LlmSelection, ModelsResponse } from "../shared/types.ts";
import { api } from "./api.ts";
import { LlmPicker } from "./LlmPicker.tsx";

export function NarrateForm({ sessionId, models, busy, reuse }: { sessionId: string; models: ModelsResponse; busy: boolean; reuse: boolean }) {
  const [base, setBase] = useState("HEAD~1");
  const [head, setHead] = useState("HEAD");
  const [llm, setLlm] = useState<LlmSelection>(models.default);
  const [error, setError] = useState<string | null>(null);
  return <form className="narrate" onSubmit={(e) => {
    e.preventDefault(); setError(null);
    api.narrate(sessionId, reuse ? { llm } : { base, head, llm }).catch((err: Error) => setError(err.message));
  }}>
    {!reuse && <><input aria-label="base" value={base} onChange={(e) => setBase(e.target.value)} size={14} />
    <span>..</span>
    <input aria-label="head" value={head} onChange={(e) => setHead(e.target.value)} size={14} /></>}
    <LlmPicker models={models} value={llm} onChange={setLlm} />
    <button type="submit" disabled={busy}>Narrate</button>
    {error && <span className="failed">{error}</span>}
  </form>;
}
