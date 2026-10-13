import { definePlugin, type Runtime, type SessionView } from "../../plugin-api.ts";
import type { ImplementBranchData } from "./shared/types.ts";
import { implementStart } from "./tasks/start/task.ts";
import { investigate } from "./tasks/investigate/task.ts";
import { implement } from "./tasks/implement/task.ts";
import { artifactKinds } from "./runtime/kinds.ts";
import { interpretComments } from "./tasks/interpret-comments/task.ts";
import { implementPhase, investigatePhase, reviewerCommentsPhase } from "./workflow/phases.ts";
import { implementWorkflow } from "./workflow/implement.ts";
import { CommentWatcher } from "./runtime/comment-watcher.ts";
import { implementRoutes } from "./server/routes.ts";
import { distillSteer } from "./tasks/distill-steer/task.ts";

function server(rt: Runtime) {
  const watcher = new CommentWatcher(rt);
  return { routes: implementRoutes(rt), start() { watcher.start(); } };
}

function linkRev(view: SessionView): string | null {
  return (view.artifacts.findLast((artifact) => artifact.type === "ImplementBranch")?.data as ImplementBranchData | undefined)?.baseSha ?? null;
}

/** Implementation workflow plugin. */
export const implementPlugin = definePlugin({ id: "implement", dependsOn: ["review", "spec"], workflows: [implementWorkflow], phases: [investigatePhase, implementPhase, reviewerCommentsPhase], tasks: [implementStart, investigate, implement, interpretComments, distillSteer], artifactKinds, linkRev, server });
