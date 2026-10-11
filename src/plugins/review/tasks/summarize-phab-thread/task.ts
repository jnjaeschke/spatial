import type { PhabCommentData, PhabThreadSummaryData } from "../../shared/types.ts";
import { phabThreads } from "../../shared/phab-threads.ts";
import { type Artifact, type LlmSelection, defineTask } from "../../../../plugin-api.ts";

const SYSTEM = "Summarize the discussion in one or two plain sentences: what is asked or disputed and where it stands; no markdown.";
const SCHEMA = { type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string" } } };

export const summarizePhabThread = defineTask<{ revision: number; rootPhid: string }, { summaryId: string }>({
  kind: "summarizePhabThread",
  async run(ctx, { revision, rootPhid }) {
    const comments = ctx.artifacts.view().artifacts.filter((item): item is Artifact<PhabCommentData> => item.type === "PhabComment" && (item.data as PhabCommentData).revision === revision);
    const thread = phabThreads(comments).find((item) => item.rootPhid === rootPhid);
    if (!thread || thread.comments.length < 4) throw new Error(`Phab thread ${rootPhid} must have at least 4 comments`);
    const prompt = thread.comments.map(({ data }) => `@${data.author} (${new Date(data.dateCreated * 1000).toISOString()}): ${data.body}`).join("\n\n");
    const selection: LlmSelection = ctx.llm.defaultSelection.backend === "claude"
      ? { backend: "claude", model: "haiku", effort: "low" }
      : { backend: "codex", model: "gpt-6-luna", effort: "low" };
    const result = await ctx.llm.run({ prompt, system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "none" }, selection);
    const json = result.json as { summary?: unknown } | undefined;
    if (typeof json?.summary !== "string") throw new Error("Phab thread summary response is missing summary");
    const data: PhabThreadSummaryData = { revision, rootPhid, commentPhids: thread.comments.map((comment) => comment.data.phid), summary: json.summary };
    const summary = ctx.artifacts.put("PhabThreadSummary", "proposed", data, result.selection);
    for (const comment of thread.comments) ctx.links.put(summary.id, comment.id, "derivedFrom");
    return { summaryId: summary.id };
  },
});
