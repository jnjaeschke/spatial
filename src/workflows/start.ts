import type { Artifact, Id, LlmSelection, SelectorQuestionData, Session, StartQuestion, WorkflowStartData, WriteMode } from "../shared/types.ts";
import type { Runtime } from "../runtime/tasks.ts";
import { createSession, resolveRepo } from "../runtime/git.ts";
import { MAX_SELECTOR_QUESTIONS } from "../tasks/select-workflow/task.ts";
import { parseCommand } from "./registry.ts";

/** Sets the session's workflow and title from its `WorkflowStart` artifact and runs the workflow. */
export async function runWorkflow(rt: Runtime, sessionId: Id, startId: Id, llm?: LlmSelection): Promise<void> {
  const start = rt.store.getArtifact<WorkflowStartData>(startId).data;
  rt.store.setSessionStart(sessionId, start.workflow, start.title);
  rt.emit(sessionId, "runtime", "session.updated", { workflow: start.workflow, title: start.title });
  const workflow = rt.workflows.get(start.workflow);
  if (!workflow) throw new Error(`Unknown workflow: ${start.workflow}`);
  await workflow.start(rt, sessionId, { params: start.params, startId, prompt: start.prompt, llm: start.llm ?? llm });
  if (workflow.next) await rt.advance(sessionId);
}

const inBackground = (sessionId: Id, work: Promise<unknown>) =>
  void work.catch((e) => console.error(`workflow failed in session ${sessionId}: ${(e as Error).message}`));

/** Runs the selector; asks the workflow's precheck question (stored as a selector question) or runs the chosen workflow. */
async function selectAndRun(rt: Runtime, sessionId: Id, prompt: string, round: number, llm?: LlmSelection, writeMode?: WriteMode): Promise<void> {
  const out = await rt.run<{ startId: Id } | { questionId: Id }>(sessionId, "selectWorkflow", { prompt, round, llm, writeMode });
  if (!("startId" in out)) return;
  const start = rt.store.getArtifact<WorkflowStartData>(out.startId).data;
  const question = await rt.workflows.get(start.workflow)?.precheck?.(rt.store.getSession(sessionId).worktree, start.params);
  if (question) {
    if (round >= MAX_SELECTOR_QUESTIONS) throw new Error(`${question.question} The request does not settle it; start again with a more specific request.`);
    const answers = question.options.filter((option) => option.params).map((option) => `"${option.label}"`).join(", ");
    const asked = rt.store.putArtifact<SelectorQuestionData>({ sessionId, type: "SelectorQuestion", status: "proposed", provenance: { taskId: "runtime" }, data: { prompt, question: `${question.question} Answer with one of: ${answers}.`, round: round + 1, ...(writeMode ? { writeMode } : {}) } });
    rt.emit(sessionId, "runtime", "artifact.created", { artifactId: asked.id, type: asked.type });
    return;
  }
  await runWorkflow(rt, sessionId, out.startId, llm);
}

/** Selects again with the user's answer to `question` appended to the request; continues in the background. */
export function continueSelection(rt: Runtime, sessionId: Id, question: Artifact<SelectorQuestionData>, answer: string, llm?: LlmSelection): void {
  const { prompt, round, writeMode } = question.data;
  const clarified = `${prompt}${round === 1 ? "\n\n# Clarification" : ""}\n\nQuestion: ${question.data.question}\nAnswer: ${answer}`;
  inBackground(sessionId, selectAndRun(rt, sessionId, clarified, round, llm, writeMode));
}

/** Starts a session in the worktree of `path` from start box text. A slash command may return a `StartQuestion` instead of a session. */
export async function startSession(rt: Runtime, path: string, text: string, llm?: LlmSelection, opts: { writeMode?: WriteMode; answer?: number } = {}): Promise<Session | StartQuestion> {
  const input = text.trim();
  if (!input) throw new Error("Request is empty");
  if (input.startsWith("/")) {
    const command = parseCommand(rt.workflows.values(), input);
    if (!command.ok) throw new Error(command.error);
    let params = command.params;
    const question = await rt.workflows.get(command.workflow)!.precheck?.((await resolveRepo(path)).worktree, params);
    if (question) {
      const chosen = opts.answer === undefined ? undefined : question.options[opts.answer];
      if (!chosen) return { question: question.question, options: question.options.map(({ label, params: patch }) => patch ? { label } : { label, cancel: true as const }) };
      if (!chosen.params) throw new Error("Start cancelled");
      params = { ...(params as object), ...chosen.params };
    }
    const title = input.slice(0, 80);
    const session = await createSession(rt.store, path, title, null);
    const start = rt.store.putArtifact<WorkflowStartData>({
      sessionId: session.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" },
      data: { via: "command", workflow: command.workflow, params, title, prompt: command.prompt, ...(llm ? { llm } : {}), ...(opts.writeMode ? { writeMode: opts.writeMode } : {}) },
    });
    rt.emit(session.id, "user", "artifact.created", { artifactId: start.id, type: start.type });
    inBackground(session.id, runWorkflow(rt, session.id, start.id, llm));
    return rt.store.getSession(session.id);
  }
  const session = await createSession(rt.store, path, input.split("\n", 1)[0]!.slice(0, 80), null);
  inBackground(session.id, selectAndRun(rt, session.id, input, 0, llm, opts.writeMode));
  return session;
}
