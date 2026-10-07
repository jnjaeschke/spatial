import { useState } from "react";
import type { Artifact, LlmSelection, SelectorQuestionData } from "../shared/types.ts";
import { api } from "./api.ts";

/** The workflow selector's open question and the box to answer it; Enter sends, Ctrl+Enter adds a line. */
export function SelectorQuestion({ sessionId, question, llm }: { sessionId: string; question: Artifact<SelectorQuestionData>; llm: LlmSelection }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    api.answerSelector(sessionId, text, llm).catch((e: Error) => { setError(e.message); setBusy(false); });
  };
  return <div className="selector-question" data-testid="selector-question">
    <p>{question.data.question}</p>
    <textarea aria-label="answer" value={text} disabled={busy} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {
      if (event.key !== "Enter" || event.shiftKey || event.altKey) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const area = event.currentTarget, { selectionStart, selectionEnd } = area;
        setText(text.slice(0, selectionStart) + "\n" + text.slice(selectionEnd));
        requestAnimationFrame(() => area.setSelectionRange(selectionStart + 1, selectionStart + 1));
        return;
      }
      event.preventDefault();
      send();
    }} />
    <button type="button" disabled={busy || !text.trim()} onClick={send}>Answer</button>
    {error && <p className="failed">{error}</p>}
  </div>;
}
