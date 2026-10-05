import { readFileSync } from "node:fs";
import type { Artifact, ChatMessageData, ChatThreadData, LlmSelection } from "../../shared/types.ts";
import { defineTask } from "../../runtime/tasks.ts";
import { buildAnchorContext } from "./context.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const same = (a?: LlmSelection, b?: LlmSelection) => !!a && !!b && a.backend === b.backend && a.model === b.model && a.effort === b.effort;

export const chatTurn = defineTask<{ threadId?: string; anchor?: string; text: string; llm: LlmSelection }, { threadId: string; messageId: string }>({
  kind: "chatTurn",
  async run(ctx, { threadId, anchor, text, llm }) {
    if ((threadId === undefined) === (anchor === undefined)) throw new Error("chatTurn needs exactly one of threadId or anchor");
    if (!text.trim()) throw new Error("Message is empty");

    let thread: Artifact<ChatThreadData>;
    if (threadId) {
      thread = ctx.artifacts.get<ChatThreadData>(threadId);
      if (thread.type !== "ChatThread") throw new Error(`Artifact ${threadId} is not a ChatThread`);
    } else {
      buildAnchorContext(ctx, anchor!);
      thread = ctx.artifacts.put<ChatThreadData>("ChatThread", "verified", { anchor: anchor! });
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
          buildAnchorContext(ctx, thread.data.anchor),
          ...(history.length ? ["# Conversation so far", "", ...history.map((m) => `${m.data.role === "user" ? "User" : "Assistant"}: ${m.data.text}`), ""] : []),
          "# Question", "", text,
        ].join("\n");

    const r = await ctx.llm.run({ prompt, system: SYSTEM, cwd: ctx.repo, tools: "read-only", resumeProviderSession: resume }, llm);
    const reply = ctx.artifacts.put<ChatMessageData>(
      "ChatMessage", "proposed",
      { role: "assistant", text: r.text, llm: r.selection, providerSessionId: r.providerSessionId },
      r.selection,
    );
    ctx.links.put(reply.id, thread.id, "reply");
    return { threadId: thread.id, messageId: reply.id };
  },
});
