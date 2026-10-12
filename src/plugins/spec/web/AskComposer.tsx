import { useState } from "react";
import { ErrorText, Segmented, useAction } from "../../../web/plugin-api.ts";
import type { TraceQuestion } from "../shared/types.ts";
import { specClient } from "./client.ts";

/** Ask about the spec: a claim to check or a scenario to trace, with the open boxes and the active trace as context. */
export function AskComposer({ sessionId, anchors, contextTraceId, onAsked }: { sessionId: string; anchors: string[]; contextTraceId: string | null; onAsked(traceId: string): void }) {
  const [mode, setMode] = useState<TraceQuestion["mode"]>("claim");
  const [question, setQuestion] = useState("");
  const action = useAction();
  const ask = () => action.run(async () => { const { traceId } = await specClient.ask(sessionId, { mode, question: question.trim(), anchors, contextTraceId }); setQuestion(""); onAsked(traceId); });
  return <form className="spec-ask" data-testid="spec-ask" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
    <h3>Ask about the spec</h3>
    <Segmented label="Question kind" value={mode} onChange={(value: "claim" | "scenario") => setMode(value)} options={[{ value: "claim", label: "Check claim", title: "Check claim" }, { value: "scenario", label: "Trace scenario", title: "Trace scenario" }]} />
    <textarea aria-label="Question about the spec" rows={3} value={question} placeholder={mode === "claim" ? "Can document be null at step 7?" : "A link is clicked inside an iframe while a navigation is ongoing"} onChange={(event) => setQuestion(event.currentTarget.value)} />
    <button type="submit" disabled={action.busy || !question.trim()}>Ask</button>
    <ErrorText error={action.error} />
  </form>;
}
