import { readFileSync } from "node:fs";
import type { BugReportData, BugSummaryData } from "../../shared/types.ts";
import { loadSchema, type LlmSelection, defineTask, runStructured } from "../../../../plugin-api.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = loadSchema(import.meta.url);
export const MAX_BUG_MARKDOWN_CHARS = 60_000;

export const summarizeBug = defineTask<{ reportId: string; llm?: LlmSelection }, { summaryId: string }>({
  kind: "summarizeBug",
  async run(ctx, { reportId, llm }) {
    const report = ctx.artifacts.get<BugReportData>(reportId, "BugReport");
    if (report.data.error) return { summaryId: "" };
    const { json, result } = await runStructured<{ summary: string }>(ctx.llm, { prompt: report.data.markdown.slice(0, MAX_BUG_MARKDOWN_CHARS), system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "none", label: "Bug summary" }, llm);
    const data: BugSummaryData = { bug: report.data.bug, summary: json.summary };
    const summary = ctx.artifacts.put("BugSummary", "proposed", data, result.selection);
    ctx.links.put(summary.id, reportId, "about");
    return { summaryId: summary.id };
  },
});
