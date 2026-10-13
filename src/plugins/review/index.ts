import { definePlugin, type Runtime, type Id, type SessionView, type DiffData } from "../../plugin-api.ts";
import { reviewPhase, reviewWorkflow } from "./workflow/review.ts";
import { artifactKinds, searchKinds } from "./runtime/review-kinds.ts";
import { importDiff } from "./tasks/import-diff/task.ts";
import { importRevision } from "./tasks/import-revision/task.ts";
import { reviewRange } from "./tasks/review-range/task.ts";
import { narrate } from "./tasks/narrate/task.ts";
import { resolveSpecRefs } from "./tasks/resolve-spec-refs/task.ts";
import { lookupSpecRef } from "./tasks/lookup-spec-ref/task.ts";
import { review } from "./tasks/review/task.ts";
import { comment } from "./tasks/comment/task.ts";
import { interdiff } from "./tasks/interdiff/task.ts";
import { carryFindings } from "./tasks/carry-findings/task.ts";
import { mapSpecSteps } from "./tasks/map-spec-steps/task.ts";
import { fetchBugs } from "./tasks/fetch-bugs/task.ts";
import { summarizeBug } from "./tasks/summarize-bug/task.ts";
import { summarizePhabThread } from "./tasks/summarize-phab-thread/task.ts";
import { draftPhabReply } from "./tasks/draft-phab-reply/task.ts";
import { introducedSymbols } from "./tasks/introduced-symbols/task.ts";
import { diagramField } from "./runtime/diagram-chat.ts";
import { RevisionWatcher } from "./runtime/revision-watcher.ts";
import { PhabricatorSyncer } from "./runtime/phabricator-sync.ts";
import { reviewRoutes } from "./server/routes.ts";

function chatContext(view: SessionView): string | null {
  const diff = [...view.artifacts].reverse().find((a) => a.type === "Diff");
  if (!diff) return null;
  const data = diff.data as { commits: { sha: string; subject: string }[] };
  return ["# Commits in the reviewed range", ...data.commits.map((commit, i) => `${i + 1}. ${commit.sha.slice(0, 12)} ${commit.subject}`)].join("\n");
}
function linkRev(view: SessionView): string | null {
  return (view.artifacts.findLast((artifact) => artifact.type === "Diff")?.data as DiffData | undefined)?.upstreamRev ?? null;
}
function server(rt: Runtime, opts: { intervalMs?: number }) {
  const watcher = new RevisionWatcher(rt, { intervalMs: opts.intervalMs });
  const syncer = new PhabricatorSyncer(rt, watcher, { intervalMs: opts.intervalMs });
  return { routes: reviewRoutes(rt), watch: (sessionId: Id) => watcher.watch(sessionId), start() { watcher.start(); syncer.start(); } };
}
export const reviewPlugin = definePlugin({ id: "review", dependsOn: ["spec"], workflows: [reviewWorkflow], phases: [reviewPhase], tasks: [importDiff, importRevision, reviewRange, narrate, resolveSpecRefs, lookupSpecRef, review, comment, interdiff, carryFindings, mapSpecSteps, fetchBugs, summarizeBug, summarizePhabThread, draftPhabReply, introducedSymbols], artifactKinds, searchKinds, chatContext, linkRev, chatReplyFields: [diagramField], server });
