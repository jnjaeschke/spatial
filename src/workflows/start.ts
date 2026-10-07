import type { Artifact, Id, LlmSelection, SelectorQuestionData, Session, WorkflowStartData } from "../shared/types.ts";
import type { Runtime } from "../runtime/tasks.ts";
import { createSession } from "../runtime/git.ts";
import { parseCommand, workflows } from "./registry.ts";

/** Sets the session's workflow and title from its `WorkflowStart` artifact and runs the workflow. */
export async function runWorkflow(rt: Runtime, sessionId: Id, startId: Id, llm?: LlmSelection): Promise<void> {
  const start = rt.store.getArtifact<WorkflowStartData>(startId).data;
  rt.store.setSessionStart(sessionId, start.workflow, start.title);
  rt.emit(sessionId, "runtime", "session.updated", { workflow: start.workflow, title: start.title });
  await workflows[start.workflow].start(rt, sessionId, { params: start.params, startId, prompt: start.prompt, llm });
}

const inBackground = (sessionId: Id, work: Promise<unknown>) =>
  void work.catch((e) => console.error(`workflow failed in session ${sessionId}: ${(e as Error).message}`));

/** Runs the selector; runs the chosen workflow unless the selector asked a question instead. */
async function selectAndRun(rt: Runtime, sessionId: Id, prompt: string, round: number, llm?: LlmSelection): Promise<void> {
  const out = await rt.run<{ startId: Id } | { questionId: Id }>(sessionId, "selectWorkflow", { prompt, round, llm });
  if ("startId" in out) await runWorkflow(rt, sessionId, out.startId, llm);
}

/** Selects again with the user's answer to `question` appended to the request; continues in the background. */
export function continueSelection(rt: Runtime, sessionId: Id, question: Artifact<SelectorQuestionData>, answer: string, llm?: LlmSelection): void {
  const { prompt, round } = question.data;
  const clarified = `${prompt}${round === 1 ? "\n\n# Clarification" : ""}\n\nQuestion: ${question.data.question}\nAnswer: ${answer}`;
  inBackground(sessionId, selectAndRun(rt, sessionId, clarified, round, llm));
}

/** Starts a session in the worktree of `path` from start box text. A `/command` is parsed without an LLM and a bad one throws before anything is created; other text goes to the selectWorkflow task. Returns once the session exists; the workflow continues in the background. */
export async function startSession(rt: Runtime, path: string, text: string, llm?: LlmSelection): Promise<Session> {
  const input = text.trim();
  if (!input) throw new Error("Request is empty");
  if (input.startsWith("/")) {
    const command = parseCommand(input);
    if (!command.ok) throw new Error(command.error);
    const title = input.slice(0, 80);
    const session = await createSession(rt.store, path, title, null);
    const start = rt.store.putArtifact<WorkflowStartData>({
      sessionId: session.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" },
      data: { via: "command", workflow: command.workflow, params: command.params, title, prompt: command.prompt },
    });
    rt.emit(session.id, "user", "artifact.created", { artifactId: start.id, type: start.type });
    inBackground(session.id, runWorkflow(rt, session.id, start.id, llm));
    return rt.store.getSession(session.id);
  }
  const session = await createSession(rt.store, path, input.split("\n", 1)[0]!.slice(0, 80), null);
  inBackground(session.id, selectAndRun(rt, session.id, input, 0, llm));
  return session;
}
