import { readFileSync } from "node:fs";
import type { Artifact, ChatMessageData, ChatThreadData, LlmSelection, RevisionData } from "../../shared/types.ts";
import { defineTask } from "../../runtime/tasks.ts";
import { buildAnchorContext, type SelectedText } from "./context.ts";
import { findSpan, revisionsOf } from "../../shared/revisions.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as object;
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
          ...(history.length ? ["# Conversation so far", "", ...history.map((m) => `${m.data.role === "user" ? "User" : "Assistant"}: ${m.data.text}`), ""] : []),
          "# Question", "", text,
        ].join("\n");

    const r = await ctx.llm.run({ prompt, system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "read-only", resumeProviderSession: resume, mcpServers: ctx.sessionMcp }, llm);
    const json = r.json as { answer?: unknown; questions?: unknown; revisions?: unknown } | undefined;
    if (!json || typeof json.answer !== "string" || !Array.isArray(json.questions) || !json.questions.every((q) => typeof q === "string") || !Array.isArray(json.revisions) || !json.revisions.every((revision) => revision && typeof revision === "object" && (revision.message === null || typeof revision.message === "string") && typeof revision.quote === "string" && typeof revision.correction === "string")) {
      throw new Error(`Chat reply is not valid JSON: ${JSON.stringify(r.json)}`);
    }
    const assistantMessages = history.filter((message) => message.type === "ChatMessage" && (message.data as ChatMessageData).role === "assistant");
    const targets: { target: Artifact<ChatMessageData>; quote: string; correction: string; start: number; end: number }[] = [];
    const errors: string[] = [];
    for (const revision of json.revisions as { message: string | null; quote: string; correction: string }[]) {
      const candidates = revision.message === null ? [...assistantMessages].reverse() : [view.artifacts.find((a) => a.id === revision.message)].filter((a): a is Artifact<ChatMessageData> => !!a);
      let chosen: typeof targets[number] | undefined;
      let reason = revision.message === null ? "quote not found in this chat" : `${revision.message}: not an assistant message`;
      let rejectReason: string | undefined;
      for (const target of candidates) {
        if (target.type !== "ChatMessage" || (target.data as ChatMessageData).role !== "assistant" || !view.artifacts.some((a) => a.id === target.id && a.sessionId === ctx.sessionId)) {
          reason = `${revision.message}: not an assistant message`; continue;
        }
        const targetData = target.data as ChatMessageData;
        const span = findSpan(targetData.text, revision.quote);
        if ("error" in span) { reason = `${revision.quote.slice(0, 60)}: ${span.error}`; continue; }
        const prior = [...revisionsOf(view, target.id).map((r) => r.data), ...targets.filter((t) => t.target.id === target.id).map((t) => ({ quote: t.quote, correction: t.correction }))];
        if (prior.some((r) => { const old = findSpan(targetData.text, r.quote); return !("error" in old) && span.start < old.end && span.end > old.start; })) {
          rejectReason = `${revision.quote.slice(0, 60)}: overlaps an earlier revision`;
          break;
        }
        chosen = { target, quote: targetData.text.slice(span.start, span.end), correction: revision.correction, ...span };
        break;
      }
      if (chosen) targets.push(chosen); else errors.push(rejectReason ?? (revision.message === null ? "quote not found in this chat" : reason));
    }
    const reply = ctx.artifacts.put<ChatMessageData>(
      "ChatMessage", "proposed",
      { role: "assistant", text: json.answer, ...(json.questions.length ? { questions: json.questions as string[] } : {}), ...(errors.length ? { revisionErrors: errors } : {}), llm: r.selection, providerSessionId: r.providerSessionId },
      r.selection,
    );
    ctx.links.put(reply.id, thread.id, "reply");
    for (const revision of targets) {
      const artifact = ctx.artifacts.put<RevisionData>("Revision", "proposed", { quote: revision.quote, correction: revision.correction }, r.selection);
      ctx.links.put(artifact.id, revision.target.id, "revises");
      ctx.links.put(artifact.id, reply.id, "derivedFrom");
    }
    return { threadId: thread.id, messageId: reply.id };
  },
});
