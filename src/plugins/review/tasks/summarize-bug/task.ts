import { readFileSync } from "node:fs";
import type { BugReportData, BugSummaryData } from "../../shared/types.ts";
import { type Artifact, type LlmSelection, defineTask } from "../../../../plugin-api.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as object;
export const MAX_BUG_MARKDOWN_CHARS = 60_000;

export const summarizeBug = defineTask<{ reportId: string; llm?: LlmSelection }, { summaryId: string }>({
  kind: "summarizeBug",
  async run(ctx, { reportId, llm }) {
    const report = ctx.artifacts.get<BugReportData>(reportId);
    if (report.type !== "BugReport") throw new Error(`Artifact ${reportId} is not a BugReport (got ${report.type})`);
    if (report.data.error) return { summaryId: "" };
    const result = await ctx.llm.run({ prompt: report.data.markdown.slice(0, MAX_BUG_MARKDOWN_CHARS), system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "none" }, llm);
    const json = result.json as { summary?: unknown } | undefined;
    if (typeof json?.summary !== "string") throw new Error("Bug summary response is missing summary");
    const data: BugSummaryData = { bug: report.data.bug, summary: json.summary };
    const summary = ctx.artifacts.put("BugSummary", "proposed", data, result.selection);
    ctx.links.put(summary.id, reportId, "about");
    return { summaryId: summary.id };
  },
});
