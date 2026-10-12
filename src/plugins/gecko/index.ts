import { definePlugin, type Runtime } from "../../plugin-api.ts";
import { geckoProfile } from "./profile.ts";
import { proposeTry } from "./tasks/propose-try/task.ts";
import { tryPhase, tryPushPhase } from "./workflow/try.ts";
import { tryPush } from "./tasks/try-push/task.ts";
import { artifactKinds } from "./runtime/kinds.ts";
import { TryWatcher } from "./runtime/try-watcher.ts";
import { tryRoutes } from "./runtime/try-routes.ts";
import { tryField } from "./runtime/try-chat.ts";
import { phabSubmitPhase, submitPhase } from "./workflow/submit.ts";
import { suggestReviewers } from "./tasks/suggest-reviewers/task.ts";
import { phabSubmit } from "./tasks/phab-submit/task.ts";
import { submitField } from "./runtime/submit-chat.ts";

function server(rt: Runtime, opts: { intervalMs?: number }) {
  const watcher = new TryWatcher(rt, { intervalMs: opts.intervalMs });
  return { routes: tryRoutes(rt, watcher), start() { watcher.start(); } };
}

/** Gecko repo profile, try and Phabricator submit phases. */
export const geckoPlugin = definePlugin({ id: "gecko", dependsOn: ["implement", "review"], repoProfiles: [geckoProfile], phases: [tryPhase, tryPushPhase, submitPhase, phabSubmitPhase], tasks: [proposeTry, tryPush, suggestReviewers, phabSubmit], artifactKinds, chatReplyFields: [tryField, submitField], server });
