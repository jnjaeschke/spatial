import { z } from "zod";
import type { Id, LlmSelection, WorkflowId, WorkflowInfo } from "../shared/types.ts";
import type { Runtime } from "../runtime/tasks.ts";
import { narratePatch } from "./narrate-patch.ts";

export type ParseResult<P> = { ok: true; params: P } | { ok: false; error: string };
export interface StartInput<P> { params: P; startId: Id; prompt: string; llm?: LlmSelection }

/** A kind of session. `description` is shown to the selector LLM and in the command popup; avoid e2e stub needles in it (see the F3 plan). */
export interface Workflow<P> extends WorkflowInfo {
  /** Params the selector must produce; a `z.strictObject` so its JSON schema is OpenAI-strict. Validates selector output. */
  params: z.ZodType<P>;
  /** Deterministic parser of the slash command's argument text. */
  parseArgs(args: string): ParseResult<P>;
  /** Runs the workflow to completion; may run LLM tasks. */
  start(rt: Runtime, sessionId: Id, input: StartInput<P>): Promise<void>;
}

const reviewParams = z.strictObject({
  base: z.string().min(1).describe("Git ref the patch applies to"),
  head: z.string().min(1).describe("Git ref of the patch head"),
});
export type ReviewParams = z.infer<typeof reviewParams>;
export type ReviewArgs = ReviewParams | { revision: { host: string | null; id: number } };

/** `D123`, `https://host/D123`, or `<base>..<head>`. */
export function parseReviewArgs(args: string): ParseResult<ReviewArgs> {
  const text = args.trim();
  const revision = /^(?:(https?:\/\/[^\s/]+)\/)?D(\d+)\/?$/.exec(text);
  if (revision) return { ok: true, params: { revision: { host: revision[1] ?? null, id: Number(revision[2]) } } };
  const range = /^(\S+?)\.\.(\S+)$/.exec(text);
  if (range && !text.includes("...")) return { ok: true, params: { base: range[1]!, head: range[2]! } };
  return { ok: false, error: "Usage: /review <D-number | base..head>" };
}

const review: Workflow<ReviewParams> = {
  id: "review",
  description: "Review a local patch: narrate and review the commits between a base and a head git ref (for example HEAD~1 and HEAD, or main and a feature branch).",
  argHint: "<D-number | base..head>",
  params: reviewParams,
  parseArgs(args) {
    const parsed = parseReviewArgs(args);
    if (!parsed.ok) return parsed;
    if ("revision" in parsed.params) return { ok: false, error: `Reviewing D${parsed.params.revision.id} without a local checkout is not available yet; check it out and use /review <base>..<head>` };
    return { ok: true, params: parsed.params };
  },
  async start(rt, sessionId, { params, llm }) {
    await narratePatch(rt, sessionId, { base: params.base, head: params.head, llm });
  },
};

const chatParams = z.strictObject({});

const chat: Workflow<z.infer<typeof chatParams>> = {
  id: "chat",
  description: "Open conversation about the repository and its code. Use it for anything that is not clearly one of the other workflows.",
  argHint: "<message>",
  params: chatParams,
  parseArgs: (args) => args.trim() ? { ok: true, params: {} } : { ok: false, error: "Usage: /chat <message>" },
  async start(rt, sessionId, { startId, prompt, llm }) {
    await rt.run(sessionId, "chatTurn", { anchor: startId, text: prompt, llm: llm ?? rt.llm.defaultSelection });
  },
};

// Workflow<any>: entries differ in P; callers pass params validated by the entry's own parser or schema.
export const workflows: Record<WorkflowId, Workflow<any>> = { review, chat };

export function workflowInfo(): WorkflowInfo[] {
  return Object.values(workflows).map(({ id, description, argHint }) => ({ id, description, argHint }));
}

/** Parses `/<id> <args>`. Unknown command or bad arguments -> error; never throws. */
export function parseCommand(text: string): { ok: true; workflow: WorkflowId; params: unknown; prompt: string } | { ok: false; error: string } {
  const m = /^(\/\S*)\s*([\s\S]*)$/.exec(text.trim());
  if (!m) return { ok: false, error: "Not a command" };
  const name = m[1]!.slice(1);
  if (!Object.hasOwn(workflows, name)) return { ok: false, error: `Unknown command /${name}; available: ${Object.keys(workflows).map((id) => `/${id}`).join(", ")}` };
  const workflow = workflows[name as WorkflowId];
  const parsed = workflow.parseArgs(m[2]!);
  return parsed.ok ? { ok: true, workflow: workflow.id, params: parsed.params, prompt: m[2]!.trim() } : parsed;
}
