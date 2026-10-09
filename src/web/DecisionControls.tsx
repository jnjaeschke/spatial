import { createContext, useContext, useState } from "react";
import type { Artifact, DecisionData, LlmSelection, ModelsResponse } from "../shared/types.ts";
import { api } from "./api.ts";
import { LlmPicker } from "./LlmPicker.tsx";
import { optionProblem, readModelChoice, saveModelChoice } from "./decisions.ts";
import { ErrorText, useAction } from "./action.tsx";

/** The models the session shell loaded; decisions whose options take a model offer a picker when set. */
export const ModelsContext = createContext<ModelsResponse | null>(null);

/** The question of a decision and a button per option; a text box when an option takes text, a model picker when one takes a model. */
export function DecisionControls({ sessionId, repoDir, decision, testId }: { sessionId: string; repoDir: string; decision: Artifact<DecisionData>; testId: string }) {
  const models = useContext(ModelsContext);
  const { question, options } = decision.data;
  const [text, setText] = useState(() => options.find((option) => option.defaultText)?.defaultText ?? "");
  const [llm, setLlm] = useState<LlmSelection | null>(() => readModelChoice(localStorage, repoDir) ?? models?.default ?? null);
  const { busy, error, run } = useAction();
  const send = (optionId: string) => {
    const option = options.find((candidate) => candidate.id === optionId)!;
    if (option.takesModel && llm) saveModelChoice(localStorage, repoDir, llm);
    void run(() => api.decide(sessionId, decision.id, option.id, { ...(option.takesText && text.trim() ? { text: text.trim() } : {}), ...(option.takesModel && llm ? { llm } : {}) }));
  };
  return <div className="decision" data-testid={testId}>
    <span className="decision-question">{question}</span>
    {options.some((option) => option.takesText) && <input aria-label="decision text" className="nodrag" value={text} onChange={(event) => setText(event.target.value)} />}
    {models && llm && options.some((option) => option.takesModel) && <LlmPicker models={models} value={llm} onChange={setLlm} />}
    <span className="decision-options">{options.map((option) => {
      const problem = optionProblem(option, option.takesText ? text : "");
      return <button key={option.id} type="button" className="nodrag" disabled={busy || problem !== null} title={problem ?? undefined} onClick={() => send(option.id)}>{option.label}</button>;
    })}</span>
    <ErrorText error={error} />
  </div>;
}
