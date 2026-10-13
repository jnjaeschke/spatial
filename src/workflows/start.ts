import { randomUUID } from "node:crypto";
import type { Id, LlmSelection, Session, StartQuestion, WorkflowStartData, WriteMode } from "../shared/types.ts";
import type { PrecheckQuestion } from "../runtime/plugins.ts";
import type { Runtime } from "../runtime/tasks.ts";
import { createSession, resolveRepo } from "../runtime/git.ts";
import { selectWorkflow } from "./select.ts";
import { parseCommand } from "./registry.ts";

/** Sets the session's workflow and title from its `WorkflowStart` artifact and runs the workflow. */
export async function runWorkflow(rt: Runtime, sessionId: Id, startId: Id, llm?: LlmSelection): Promise<void> {
  const start = rt.store.getArtifact<WorkflowStartData>(startId).data;
  rt.store.setSessionStart(sessionId, start.workflow, start.title);
  rt.emit(sessionId, "runtime", "session.updated", { workflow: start.workflow, title: start.title });
  const workflow = rt.workflows.get(start.workflow);
  if (!workflow) throw new Error(`Unknown workflow: ${start.workflow}`);
  await workflow.start(rt, sessionId, { params: start.params, startId, prompt: start.prompt, llm: start.llm ?? llm });
  await rt.advance(sessionId);
}

/** A start box request: new text, or the answer to an open `StartQuestion` (an option index, or text when the question has no options). */
export type StartRequest = { path: string; text: string; llm?: LlmSelection; writeMode?: WriteMode } | { question: string; answer: number | string };

export interface StartBase { path: string; worktree: string; llm?: LlmSelection; writeMode?: WriteMode }
export type Chosen = Omit<WorkflowStartData, "llm" | "writeMode">;
/** A start waiting in the start box: the selector's clarifying question, or the chosen workflow's precheck. */
export type PendingStart = { base: StartBase; question: string } & (
  | { prompt: string; round: number }
  | { start: Chosen; selection?: LlmSelection; options: PrecheckQuestion<unknown>["options"] }
);

const inBackground = (sessionId: Id, work: Promise<unknown>) =>
  void work.catch((e) => console.error(`workflow failed in session ${sessionId}: ${(e as Error).message}`));

/** Handles the start box until a workflow is chosen: runs the selector or parses the command, asks the selector's and the workflow's questions, then creates the session and starts its workflow in the background. No session exists before that. `pending` holds the open questions. */
export async function startSession(rt: Runtime, pending: Map<string, PendingStart>, request: StartRequest, signal: AbortSignal): Promise<Session | StartQuestion> {
  if ("question" in request) return answer(rt, pending, request.question, request.answer, signal);
  const input = request.text.trim();
  if (!input) throw new Error("Request is empty");
  const base: StartBase = { path: request.path, worktree: (await resolveRepo(request.path)).worktree, ...(request.llm ? { llm: request.llm } : {}), ...(request.writeMode ? { writeMode: request.writeMode } : {}) };
  if (!input.startsWith("/")) return select(rt, pending, base, input, 0, signal);
  const command = parseCommand(rt.workflows.values(), input);
  if (!command.ok) throw new Error(command.error);
  return precheck(rt, pending, base, { via: "command", workflow: command.workflow, params: command.params, title: input.slice(0, 80), prompt: command.prompt });
}

async function select(rt: Runtime, pending: Map<string, PendingStart>, base: StartBase, prompt: string, round: number, signal: AbortSignal): Promise<Session | StartQuestion> {
  const selected = await selectWorkflow(rt, base.worktree, prompt, round, base.llm, signal);
  if ("question" in selected) return ask(pending, { base, question: selected.question, prompt, round: round + 1 });
  return precheck(rt, pending, base, { via: "selector", workflow: selected.workflow, params: selected.params, title: selected.title, prompt }, selected.selection);
}

async function precheck(rt: Runtime, pending: Map<string, PendingStart>, base: StartBase, start: Chosen, selection?: LlmSelection): Promise<Session | StartQuestion> {
  const question = await rt.workflows.get(start.workflow)!.precheck?.(base.worktree, start.params, rt);
  if (!question) return begin(rt, base, start, selection);
  return ask(pending, { base, question: question.question, start, ...(selection ? { selection } : {}), options: question.options });
}

function ask(pending: Map<string, PendingStart>, entry: PendingStart): StartQuestion {
  const id = randomUUID();
  pending.set(id, entry);
  return { id, question: entry.question, ...("options" in entry ? { options: entry.options.map(({ label, params }) => params ? { label } : { label, cancel: true as const }) } : {}) };
}

async function answer(rt: Runtime, pending: Map<string, PendingStart>, id: string, reply: number | string, signal: AbortSignal): Promise<Session | StartQuestion> {
  const entry = pending.get(id);
  if (!entry) throw new Error("This question is no longer open; start again");
  if ("options" in entry) {
    const option = typeof reply === "number" ? entry.options[reply] : undefined;
    if (!option) throw new Error("Invalid answer");
    pending.delete(id);
    if (!option.params) throw new Error("Start cancelled");
    return begin(rt, entry.base, { ...entry.start, params: { ...(entry.start.params as object), ...option.params } }, entry.selection);
  }
  const text = typeof reply === "string" ? reply.trim() : "";
  if (!text) throw new Error("Answer must not be empty");
  const clarified = `${entry.prompt}${entry.round === 1 ? "\n\n# Clarification" : ""}\n\nQuestion: ${entry.question}\nAnswer: ${text}`;
  pending.delete(id);
  // A failed selection leaves the question open, so the user can answer again.
  try { return await select(rt, pending, entry.base, clarified, entry.round, signal); }
  catch (e) { pending.set(id, entry); throw e; }
}

/** Creates a workflow session; callers can wait for the workflow instead of running it in the background. */
export async function begin(rt: Runtime, base: StartBase, start: Chosen, selection?: LlmSelection, waitForWorkflow = false): Promise<Session> {
  const session = await createSession(rt.store, base.path, start.title, start.workflow);
  const artifact = rt.putArtifact<WorkflowStartData>(selection ? "runtime" : "user", {
    sessionId: session.id, type: "WorkflowStart", status: start.via === "command" ? "verified" : "proposed",
    provenance: selection ? { taskId: "runtime", llm: selection } : { taskId: "user" },
    data: { ...start, ...(base.llm ? { llm: base.llm } : {}), ...(base.writeMode ? { writeMode: base.writeMode } : {}) },
  });
  const work = runWorkflow(rt, session.id, artifact.id, base.llm);
  if (waitForWorkflow) await work;
  else inBackground(session.id, work);
  return session;
}
