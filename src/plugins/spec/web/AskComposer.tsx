import { useState } from "react";
import { Composer, ErrorText, Segmented, useAction } from "../../../web/plugin-api.ts";
import type { TraceQuestion } from "../shared/types.ts";
import { specClient } from "./client.ts";

/** Ask about the spec: a claim to check or a scenario to trace, with the open boxes and the active trace as context. */
export function AskComposer({ sessionId, anchors, contextTraceId, onAsked }: { sessionId: string; anchors: string[]; contextTraceId: string | null; onAsked(traceId: string): void }) {
  const [mode, setMode] = useState<TraceQuestion["mode"]>("claim");
  const [question, setQuestion] = useState("");
  const action = useAction();
  const canAsk = !action.busy && question.trim() !== "";
  const ask = () => action.run(async () => { const { traceId } = await specClient.ask(sessionId, { mode, question: question.trim(), anchors, contextTraceId }); setQuestion(""); onAsked(traceId); });
  return <form className="spec-ask" data-testid="spec-ask" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
    <h3>Ask about the spec</h3>
    <Segmented label="Question kind" value={mode} onChange={(value: "claim" | "scenario") => setMode(value)} options={[
      { value: "claim", label: "Check claim", description: "Ask whether a statement holds in the spec. The AI walks the algorithm steps that decide it, answers holds, fails or unclear, and cites each step; the steps it walked become a trace whose hops and notes are then checked." },
      { value: "scenario", label: "Trace scenario", description: "Describe a situation. The AI walks the algorithm steps it goes through, in execution order, with a note per step; the steps it walked become a trace whose hops and notes are then checked. No verdict." },
    ]} />
    <Composer label="Question about the spec" rows={3} value={question} placeholder={mode === "claim" ? "Can document be null at step 7?" : "A link is clicked inside an iframe while a navigation is ongoing"} onChange={setQuestion} canSubmit={canAsk} onSubmit={() => void ask()} />
    <button type="submit" disabled={!canAsk}>Ask</button>
    <ErrorText error={action.error} />
  </form>;
}
