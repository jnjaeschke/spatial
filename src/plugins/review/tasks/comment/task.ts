import { readFileSync } from "node:fs";
import type { ReviewCommentData, ReviewFindingData } from "../../shared/types.ts";
import { loadSchema, type Artifact, type ChatMessageData, type LlmSelection, defineTask, revisedText, runStructured } from "../../../../plugin-api.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = loadSchema(import.meta.url);

export const comment = defineTask<{ findingId: string; llm?: LlmSelection }, { commentId: string }>({
  kind: "comment",
  async run(ctx, { findingId, llm }) {
    const finding = ctx.artifacts.get<ReviewFindingData>(findingId);
    if (finding.type !== "ReviewFinding") throw new Error(`Artifact ${findingId} is not a ReviewFinding (got ${finding.type})`);
    const view = ctx.artifacts.view();
    const threadLink = view.links.find((link) => link.kind === "about" && link.to === findingId &&
      view.artifacts.find((artifact) => artifact.id === link.from)?.type === "ChatThread");
    const thread = threadLink && view.artifacts.find((artifact) => artifact.id === threadLink.from);
    const messages = thread
      ? view.links.filter((link) => link.kind === "reply" && link.to === thread.id)
          .map((link) => view.artifacts.find((artifact) => artifact.id === link.from))
          .filter((artifact): artifact is Artifact<ChatMessageData> => artifact?.type === "ChatMessage")
      : [];
    const prompt = [
      "# Finding",
      `Title: ${finding.data.title}`,
      `Category: ${finding.data.category}`,
      `Severity: ${finding.data.severity}`,
      `Anchor: ${finding.data.anchor}`,
      ...(finding.data.quote === undefined ? [] : [`Quote: ${finding.data.quote}`]),
      ...(finding.data.lines === undefined ? [] : [`Lines: ${finding.data.lines.path}:${finding.data.lines.start}-${finding.data.lines.end} (${finding.data.lines.side})`]),
      "",
      finding.data.body,
      ...(messages.length ? ["", "# Conversation", ...messages.map((message) => `${message.data.role === "user" ? "User" : "Assistant"}: ${revisedText(view, message)}`)] : []),
    ].join("\n");
    const { json, result: r } = await runStructured<{ body: string }>(ctx.llm, { prompt, system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "none", label: "Comment reply", repairs: 1 }, llm);
    const artifact = ctx.artifacts.put<ReviewCommentData>("ReviewComment", "proposed", { finding: findingId, body: json.body }, r.selection);
    ctx.links.put(artifact.id, findingId, "about");
    return { commentId: artifact.id };
  },
});
