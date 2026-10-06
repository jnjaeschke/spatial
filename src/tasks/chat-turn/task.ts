import { readFileSync } from "node:fs";
import type { Artifact, ChatMessageData, ChatThreadData, LlmSelection, RevisionData } from "../../shared/types.ts";
import { defineTask } from "../../runtime/tasks.ts";
import { buildAnchorContext, type SelectedText } from "./context.ts";
import { findSpan, revisedText, revisionsOf } from "../../shared/revisions.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as object;
interface Reply { answer: string; questions: string[]; revisions: { message: string | null; quote: string; correction: string }[] }
const isReply = (j: unknown): j is Reply => {
  const r = j as Partial<Reply> | undefined;
  return typeof r?.answer === "string" && Array.isArray(r.questions) && r.questions.every((q) => typeof q === "string") && Array.isArray(r.revisions) &&
    r.revisions.every((v) => (v?.message === null || typeof v?.message === "string") && typeof v.quote === "string" && typeof v.correction === "string");
};
const same = (a?: LlmSelection, b?: LlmSelection) => !!a && !!b && a.backend === b.backend && a.model === b.model && a.effort === b.effort;

export const chatTurn = defineTask<{ threadId?: string; anchor?: string; text: string; quote?: string; lines?: SelectedText["lines"]; llm: LlmSelection }, { threadId: string; messageId: string }>({
  kind: "chatTurn",
  async run(ctx, { threadId, anchor, text, quote, lines, llm }) {
    if ((threadId === undefined) === (anchor === undefined)) throw new Error("chatTurn needs exactly one of threadId or anchor");
    if (!text.trim()) throw new Error("Message is empty");
    const view = ctx.artifacts.view();
    let thread: Artifact<ChatThreadData>;
    if (threadId) {
      thread = ctx.artifacts.get<ChatThreadData>(threadId);
      if (thread.type !== "ChatThread") throw new Error(`Artifact ${threadId} is not a ChatThread`);
    } else {
      buildAnchorContext(view, anchor!);
      thread = ctx.artifacts.put<ChatThreadData>("ChatThread", "verified", { anchor: anchor!, quote, lines });
      ctx.links.put(thread.id, anchor!, "about");
    }

    const history = ctx.artifacts.linkedTo(thread.id, "reply") as Artifact<ChatMessageData>[];
    const user = ctx.artifacts.put<ChatMessageData>("ChatMessage", "verified", { role: "user", text });
    ctx.links.put(user.id, thread.id, "reply");

    const lastAssistant = history.filter((m) => m.data.role === "assistant").at(-1);
    const resume = same(lastAssistant?.data.llm, llm) ? lastAssistant!.data.providerSessionId : undefined;
    const prompt = resume
      ? text
      : [
          buildAnchorContext(view, thread.data.anchor, thread.data.quote === undefined ? undefined : { quote: thread.data.quote, lines: thread.data.lines }),
          ...(history.length ? ["# Conversation so far", "", ...history.map((m) => `${m.data.role === "user" ? "User" : "Assistant"}: ${revisedText(view, m)}`), ""] : []),
          "# Question", "", text,
        ].join("\n");

    const r = await ctx.llm.run({ prompt, system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "read-only", resumeProviderSession: resume, mcpServers: { ...ctx.sessionMcp, ...ctx.repoMcp } }, llm);
    const json = r.json as Reply | undefined;
    if (!isReply(json)) throw new Error(`Chat reply is not valid JSON: ${JSON.stringify(r.json)}`);

    const newestFirst = history.filter((m) => m.data.role === "assistant").reverse();
    const accepted: { target: Artifact<ChatMessageData>; data: RevisionData }[] = [];
    const errors: string[] = [];
    for (const revision of json.revisions) {
      const result = resolveRevision(revision);
      if (typeof result === "string") errors.push(result); else accepted.push(result);
    }
    function resolveRevision(revision: Reply["revisions"][number]): { target: Artifact<ChatMessageData>; data: RevisionData } | string {
      const label = revision.quote.slice(0, 60);
      let candidates = newestFirst;
      if (revision.message !== null) {
        const message = view.artifacts.find((a) => a.id === revision.message);
        if (message?.type !== "ChatMessage" || (message.data as ChatMessageData).role !== "assistant") return `${revision.message}: not an assistant message`;
        candidates = [message as Artifact<ChatMessageData>];
      }
      const failures: string[] = [];
      for (const target of candidates) {
        const span = findSpan(target.data.text, revision.quote);
        if ("error" in span) { failures.push(span.error); continue; }
        const earlier = [...revisionsOf(view, target.id).map((a) => a.data), ...accepted.filter((a) => a.target.id === target.id).map((a) => a.data)];
        if (earlier.some((e) => { const old = findSpan(target.data.text, e.quote); return !("error" in old) && span.start < old.end && span.end > old.start; })) {
          return `${label}: overlaps an earlier revision`;
        }
        return { target, data: { quote: target.data.text.slice(span.start, span.end), correction: revision.correction } };
      }
      return `${label}: ${failures.find((f) => f !== "quote not found") ?? (revision.message === null ? "quote not found in this chat" : "quote not found")}`;
    }

    const reply = ctx.artifacts.put<ChatMessageData>(
      "ChatMessage", "proposed",
      { role: "assistant", text: json.answer, ...(json.questions.length ? { questions: json.questions } : {}), ...(errors.length ? { revisionErrors: errors } : {}), llm: r.selection, providerSessionId: r.providerSessionId },
      r.selection,
    );
    ctx.links.put(reply.id, thread.id, "reply");
    for (const { target, data } of accepted) {
      const revision = ctx.artifacts.put<RevisionData>("Revision", "proposed", data, r.selection);
      ctx.links.put(revision.id, target.id, "revises");
      ctx.links.put(revision.id, reply.id, "derivedFrom");
    }
    return { threadId: thread.id, messageId: reply.id };
  },
});
