import { z } from "zod";
import { definePlugin, type Workflow } from "../../plugin-api.ts";
import type { Runtime } from "../../runtime/tasks.ts";
import type { Id, LlmSelection } from "../../shared/types.ts";
import { parseRevisionRef } from "../../shared/phabricator.ts";
import { narratePatch } from "../../workflows/narrate-patch.ts";
import { artifactKinds, searchKinds, reviewOverview } from "../../runtime/review-kinds.ts";
import { importDiff } from "../../tasks/import-diff/task.ts";
import { importRevision } from "../../tasks/import-revision/task.ts";
import { reviewRange } from "../../tasks/review-range/task.ts";
import { narrate } from "../../tasks/narrate/task.ts";
import { resolveSpecRefs } from "../../tasks/resolve-spec-refs/task.ts";
import { review } from "../../tasks/review/task.ts";
import { comment } from "../../tasks/comment/task.ts";
import { interdiff } from "../../tasks/interdiff/task.ts";
import { carryFindings } from "../../tasks/carry-findings/task.ts";
import { mapSpecSteps } from "../../tasks/map-spec-steps/task.ts";
import { diagramField } from "../../runtime/diagram-chat.ts";
import type { SessionView } from "../../runtime/render-ref.ts";
import { RevisionWatcher } from "../../runtime/revision-watcher.ts";
import { PhabricatorSyncer } from "../../runtime/phabricator-sync.ts";

const params = z.strictObject({ base: z.string().min(1).nullable(), head: z.string().min(1).nullable(), revision: z.string().nullable() }).refine((p) => p.revision !== null ? p.base === null && p.head === null && parseRevisionRef(p.revision) !== null : (p.base === null) === (p.head === null), "Give either a revision or both refs");
type Params = z.infer<typeof params>;
export function parseReviewArgs(args: string): { ok: true; params: Params } | { ok: false; error: string } {
  const text = args.trim();
  if (!text) return { ok: true, params: { base: null, head: null, revision: null } };
  if (parseRevisionRef(text)) return { ok: true, params: { base: null, head: null, revision: text } };
  const range = /^(\S+?)\.\.(\S+)$/.exec(text);
  if (range && !text.includes("...")) return { ok: true, params: { base: range[1]!, head: range[2]!, revision: null } };
  return { ok: false, error: "Usage: /review [D-number | base..head]" };
}
const workflow: Workflow<Params> = {
  id: "review", description: "Review a local patch: analyze and review the changes between a base and a head git ref (for example main and a feature branch), or a Phabricator revision (D123, or its URL) whose stack is imported without checking it out. With no refs it reviews the uncommitted changes in the work tree, or the latest commit when there are none.", argHint: "[D-number | base..head]", params, parseArgs: parseReviewArgs,
  async start(rt: Runtime, sessionId: Id, { params: p, llm }: { params: Params; startId: Id; prompt: string; llm?: LlmSelection }) {
    if (p.revision !== null) { const { host, id } = parseRevisionRef(p.revision)!; const range = await rt.run<{ base: string; head: string }>(sessionId, "importRevision", { host, id }); await narratePatch(rt, sessionId, { ...range, llm }); return; }
    const range = p.base !== null && p.head !== null ? { base: p.base, head: p.head } : await rt.run<{ base: string; head: string }>(sessionId, "reviewRange", {});
    await narratePatch(rt, sessionId, { ...range, llm });
  },
  overview: reviewOverview,
};

function chatContext(view: SessionView): string | null {
  const diff = [...view.artifacts].reverse().find((a) => a.type === "Diff");
  if (!diff) return null;
  const data = diff.data as { commits: { sha: string; subject: string }[] };
  return ["# Commits in the reviewed range", ...data.commits.map((commit, i) => `${i + 1}. ${commit.sha.slice(0, 12)} ${commit.subject}`)].join("\n");
}
function server(rt: Runtime, opts: { intervalMs?: number }) {
  const watcher = new RevisionWatcher(rt, { intervalMs: opts.intervalMs });
  const syncer = new PhabricatorSyncer(rt, watcher, { intervalMs: opts.intervalMs });
  return { watch: (sessionId: Id) => watcher.watch(sessionId), start() { watcher.start(); syncer.start(); } };
}
export const reviewPlugin = definePlugin({ id: "review", workflows: [workflow], tasks: [importDiff, importRevision, reviewRange, narrate, resolveSpecRefs, review, comment, interdiff, carryFindings, mapSpecSteps], artifactKinds, searchKinds, chatContext, chatReplyFields: [diagramField], server });
