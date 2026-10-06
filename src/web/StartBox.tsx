import { useEffect, useState } from "react";
import type { LlmSelection, ModelsResponse, WorkflowInfo } from "../shared/types.ts";
import { api } from "./api.ts";
import { LlmPicker } from "./LlmPicker.tsx";
import { commandSuggestions, completeCommand } from "./slash.ts";

export function StartBox({ path, models }: { path: string; models: ModelsResponse }) {
  const [commands, setCommands] = useState<WorkflowInfo[]>([]);
  const [text, setText] = useState("");
  const [llm, setLlm] = useState<LlmSelection>(models.default);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.workflows().then(setCommands, (e: Error) => setError(e.message)); }, []);
  const suggestions = dismissed ? [] : commandSuggestions(text, commands);
  const selected = Math.min(active, suggestions.length - 1);
  const complete = (command: WorkflowInfo) => { setText(completeCommand(command)); setActive(0); };
  const submit = () => {
    if (busy || !text.trim()) return;
    setBusy(true); setError(null);
    api.start(path, text, llm).then((s) => { location.search = `?session=${encodeURIComponent(s.id)}`; }, (e: Error) => { setError(e.message); setBusy(false); });
  };
  return <form className="start-box" onSubmit={(e) => { e.preventDefault(); submit(); }}>
    <div className="start-input">
    <textarea aria-label="start" rows={3} value={text} placeholder="What do you want to do? Type / for commands — Enter to send, Ctrl+Enter for newline"
      onChange={(e) => { setText(e.target.value); setDismissed(false); setActive(0); setError(null); }}
      onKeyDown={(e) => {
        if (suggestions.length) {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((selected + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
            return;
          }
          if ((e.key === "Tab" || e.key === "Enter") && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); complete(suggestions[selected]!); return; }
          if (e.key === "Escape") { e.preventDefault(); setDismissed(true); return; }
        }
        if (e.key !== "Enter" || e.nativeEvent.isComposing || e.shiftKey) return;
        e.preventDefault();
        if (e.ctrlKey) {
          const el = e.currentTarget;
          el.setRangeText("\n", el.selectionStart, el.selectionEnd, "end");
          setText(el.value);
        } else submit();
      }} />
    {suggestions.length > 0 && <ul className="command-popup" role="listbox" aria-label="commands">
      {suggestions.map((c, i) => <li key={c.id} role="option" aria-selected={i === selected} onMouseDown={(e) => { e.preventDefault(); complete(c); }}>
        <b>/{c.id}</b> <code>{c.argHint}</code> <span>{c.description}</span>
      </li>)}
    </ul>}
    </div>
    <LlmPicker models={models} value={llm} onChange={setLlm} />
    <button type="submit" disabled={busy || !text.trim()}>Start</button>
    {error && <p className="failed" data-testid="start-error">{error}</p>}
  </form>;
}
