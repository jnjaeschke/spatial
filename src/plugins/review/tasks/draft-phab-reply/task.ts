import { readFileSync } from "node:fs";
import type { PhabCommentData, SuggestedReplyData } from "../../shared/types.ts";
import { phabThreads } from "../../shared/phab-threads.ts";
import { type Artifact, type ChatMessageData, type JsonSchema, type LlmSelection, defineTask, revisedText, runStructured } from "../../../../plugin-api.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as JsonSchema;

export const draftPhabReply = defineTask<{ anchorId: string; threadId: string; llm?: LlmSelection }, { replyId: string; body: string }>({
  kind: "draftPhabReply",
  async run(ctx, { anchorId, threadId, llm }) {
    const view = ctx.artifacts.view();
    const anchor = view.artifacts.find((item): item is Artifact<PhabCommentData> => item.id === anchorId && item.type === "PhabComment");
    if (!anchor) throw new Error(`Artifact ${anchorId} is not a PhabComment`);
    const comments = view.artifacts.filter((item): item is Artifact<PhabCommentData> => item.type === "PhabComment" && (item.data as PhabCommentData).revision === anchor.data.revision);
    const thread = phabThreads(comments).find((item) => item.comments.some((comment) => comment.data.phid === anchor.data.phid));
    if (!thread) throw new Error(`Phab comment ${anchorId} has no thread`);
    const messages = view.links.filter((link) => link.kind === "reply" && link.to === threadId)
      .map((link) => view.artifacts.find((artifact) => artifact.id === link.from))
      .filter((artifact): artifact is Artifact<ChatMessageData> => artifact?.type === "ChatMessage");
    if (!messages.some((message) => message.data.role === "assistant")) throw new Error(`Chat ${threadId} has no answer`);
    const prompt = [
      "# Phabricator thread",
      ...thread.comments.map(({ data }) => `@${data.author}: ${data.body}`),
      "",
      "# Conversation",
      ...messages.map((message) => `${message.data.role === "user" ? "User" : "Assistant"}: ${revisedText(view, message)}`),
    ].join("\n");
    const { json, result } = await runStructured<{ body: string }>(ctx.llm, { prompt, system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "none", label: "Reply draft" }, llm);
    const reply = ctx.artifacts.put<SuggestedReplyData>("SuggestedReply", "proposed", { anchor: anchorId, body: json.body }, result.selection);
    ctx.links.put(reply.id, anchorId, "about");
    return { replyId: reply.id, body: json.body };
  },
});
