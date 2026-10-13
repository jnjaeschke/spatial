import { type DiffData, defineTask, sessionProfile } from "../../../../plugin-api.ts";
import type { BugReportData } from "../../shared/types.ts";

export function parseBugMarkdown(markdown: string): Pick<BugReportData, "title" | "status" | "component"> {
  const title = /^# Bug \d+ - (.*)$/m.exec(markdown)?.[1] ?? "";
  const status = /^- \*\*Status\*\*: (.*)$/m.exec(markdown)?.[1] ?? "";
  const product = /^- \*\*Product\*\*: (.*)$/m.exec(markdown)?.[1] ?? "";
  const component = /^- \*\*Component\*\*: (.*)$/m.exec(markdown)?.[1] ?? "";
  return { title, status, component: product && component ? `${product} :: ${component}` : "" };
}

export const fetchBugs = defineTask<{ diffId: string }, { reportIds: string[] }>({
  kind: "fetchBugs",
  async run(ctx, { diffId }) {
    const { fetchBug } = await sessionProfile(ctx.repoProfiles, ctx.artifacts.view(), ctx.repo);
    if (!fetchBug) return { reportIds: [] };
    const diff = ctx.artifacts.get<DiffData>(diffId, "Diff");
    const existing = new Set(ctx.artifacts.view().artifacts.filter((a) => a.type === "BugReport").map((a) => (a.data as BugReportData).bug));
    const bugs = [...new Set(diff.data.commits.flatMap((commit) => [...commit.subject.matchAll(/\bBug (\d+)\b/gi)].map((m) => Number(m[1]))))].filter((bug) => !existing.has(bug));
    const reportIds: string[] = [];
    for (const bug of bugs) {
      let data: BugReportData;
      try {
        const markdown = await fetchBug(String(bug), ctx);
        if (markdown === null) return { reportIds };
        data = { bug, ...parseBugMarkdown(markdown), markdown, error: null };
      } catch (error) {
        if (ctx.signal.aborted) throw error;
        data = { bug, title: "", status: "", component: "", markdown: "", error: (error as Error).message };
      }
      const report = ctx.artifacts.put("BugReport", "verified", data);
      reportIds.push(report.id);
    }
    return { reportIds };
  },
});
