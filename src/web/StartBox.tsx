import { useEffect, useState } from "react";
import type { LlmSelection, ModelsResponse, StartQuestion, WorkflowInfo, WriteMode } from "../shared/types.ts";
import { api } from "./api.ts";
import { LlmPicker } from "./LlmPicker.tsx";
import { DescribedOptions } from "./custom-select.tsx";
import { commandSuggestions, completeCommand } from "./slash.ts";
import { readWriteMode, saveWriteMode, WRITE_MODES } from "./write-mode.ts";
import { Composer } from "./Composer.tsx";
import { COMPOSER_HINT } from "./composer-key.ts";
import { ErrorText, useAction } from "./action.tsx";
import { navigateTo, routeUrl } from "./routes.ts";

export function StartBox({ path, repoDir, models }: { path: string; repoDir: string; models: ModelsResponse }) {
  const [commands, setCommands] = useState<WorkflowInfo[]>([]);
  const [text, setText] = useState("");
  const [llm, setLlm] = useState<LlmSelection>(models.default);
  const [writeMode, setWriteMode] = useState(() => readWriteMode(localStorage, repoDir));
  const [question, setQuestion] = useState<StartQuestion | null>(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const { busy, error, run, fail, clear } = useAction();
  useEffect(() => { api.workflows().then(setCommands, (e: Error) => fail(e.message)); }, []);
  const suggestions = dismissed ? [] : commandSuggestions(text, commands);
  const selected = Math.min(active, suggestions.length - 1);
  const complete = (command: WorkflowInfo) => { setText(completeCommand(command)); setActive(0); };
  const submit = (answer?: number) => {
    if (busy || !text.trim()) return;
    void run(async () => {
      const result = await api.start(path, text, llm, { writeMode, ...(answer === undefined ? {} : { answer }) });
      if ("question" in result) { setQuestion(result); return; }
      navigateTo(routeUrl({ kind: "session", sessionId: result.id, place: null }));
    });
  };
  return <form className="start-box" onSubmit={(e) => { e.preventDefault(); submit(); }}>
    <div className="start-input">
    <Composer label="start" rows={3} value={text} placeholder={`What do you want to do? Type / for commands — ${COMPOSER_HINT}`} canSubmit={!busy && !!text.trim()} onSubmit={() => submit()}
      onChange={(value) => { setText(value); setDismissed(false); setActive(0); clear(); setQuestion(null); }}
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
      }} />
    {suggestions.length > 0 && <ul className="command-popup" role="listbox" aria-label="commands">
      {suggestions.map((c, i) => <li key={c.id} role="option" aria-selected={i === selected} onMouseMove={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); complete(c); }}>
        <b>/{c.id}</b> <code>{c.argHint}</code> <span>{c.description}</span>
      </li>)}
    </ul>}
    </div>
    <div className="start-controls">
      <LlmPicker models={models} value={llm} onChange={setLlm} labeled />
      <label className="field"><span className="field-label">Agent access</span>
        <select className="write-mode" aria-label="write mode" value={writeMode} onChange={(e) => { const mode = e.target.value as WriteMode; setWriteMode(mode); saveWriteMode(localStorage, repoDir, mode); }}>
          <DescribedOptions options={WRITE_MODES.map((mode) => ({ value: mode.id, label: mode.label, description: mode.title }))} />
        </select>
      </label>
      <button type="submit" className="start-submit" disabled={busy || !text.trim()}>Start</button>
    </div>
    {question && <div className="start-question" data-testid="start-question">
      <p>{question.question}</p>
      {question.options.map((option, index) => <button key={option.label} type="button" onClick={() => option.cancel ? setQuestion(null) : submit(index)}>{option.label}</button>)}
    </div>}
    <ErrorText error={error} testId="start-error" />
  </form>;
}
