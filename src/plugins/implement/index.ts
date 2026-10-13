import { definePlugin, type Id, type Runtime } from "../../plugin-api.ts";
import { implementStart } from "./tasks/start/task.ts";
import { investigate } from "./tasks/investigate/task.ts";
import { implement } from "./tasks/implement/task.ts";
import { artifactKinds } from "./runtime/kinds.ts";
import { interpretComments } from "./tasks/interpret-comments/task.ts";
import { adoptPhase, adoptRangePhase, implementPhase, investigatePhase, reviewerCommentsPhase } from "./workflow/phases.ts";
import { implementWorkflow } from "./workflow/implement.ts";
import { CommentWatcher } from "./runtime/comment-watcher.ts";
import { implementRoutes } from "./server/routes.ts";
import { distillSteer } from "./tasks/distill-steer/task.ts";
import { adoptPlan } from "./tasks/adopt-plan/task.ts";
import { adoptRange } from "./tasks/adopt-range/task.ts";
import { BranchWatcher } from "./runtime/branch-watcher.ts";

function server(rt: Runtime) {
  const watcher = new CommentWatcher(rt);
  const branches = new BranchWatcher(rt);
  return { routes: implementRoutes(rt), watch: (sessionId: Id) => branches.watch(sessionId), start() { watcher.start(); branches.start(); } };
}

/** Implementation workflow plugin. */
export const implementPlugin = definePlugin({ id: "implement", dependsOn: ["review", "spec"], workflows: [implementWorkflow], phases: [investigatePhase, implementPhase, reviewerCommentsPhase, adoptPhase, adoptRangePhase], tasks: [implementStart, investigate, implement, interpretComments, distillSteer, adoptPlan, adoptRange], artifactKinds, server });
