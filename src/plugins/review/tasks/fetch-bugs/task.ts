import { type DiffData, defineTask, isGeckoRepo } from "../../../../plugin-api.ts";
import type { BugReportData } from "../../shared/types.ts";
import { fetchBugMarkdown } from "../../../../plugin-api.ts";

export function parseBugMarkdown(markdown: string): Pick<BugReportData, "title" | "status" | "component"> {
  const title = /^# Bug \d+ - (.*)$/m.exec(markdown)?.[1] ?? "";
  const status = /^- \*\*Status\*\*: (.*)$/m.exec(markdown)?.[1] ?? "";
  const product = /^- \*\*Product\*\*: (.*)$/m.exec(markdown)?.[1] ?? "";
  const component = /^- \*\*Component\*\*: (.*)$/m.exec(markdown)?.[1] ?? "";
  return { title, status, component: product && component ? `${product} :: ${component}` : "" };
}

export const fetchBugsWith = (fetch: typeof fetchBugMarkdown) => defineTask<{ diffId: string }, { reportIds: string[] }>({
  kind: "fetchBugs",
  async run(ctx, { diffId }) {
    if (!isGeckoRepo(ctx.repo) || ctx.repoMcp.moz?.type !== "http") return { reportIds: [] };
    const diff = ctx.artifacts.get<DiffData>(diffId);
    if (diff.type !== "Diff") throw new Error(`Artifact ${diffId} is not a Diff (got ${diff.type})`);
    const existing = new Set(ctx.artifacts.view().artifacts.filter((a) => a.type === "BugReport").map((a) => (a.data as BugReportData).bug));
    const bugs = [...new Set(diff.data.commits.flatMap((commit) => [...commit.subject.matchAll(/\bBug (\d+)\b/gi)].map((m) => Number(m[1]))))].filter((bug) => !existing.has(bug));
    const reportIds: string[] = [];
    for (const bug of bugs) {
      let data: BugReportData;
      try {
        const markdown = await fetch(ctx.repoMcp.moz.url, bug, ctx.signal);
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

export const fetchBugs = fetchBugsWith(fetchBugMarkdown);
