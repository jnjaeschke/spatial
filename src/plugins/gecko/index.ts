import { definePlugin, type Runtime } from "../../plugin-api.ts";
import { isGeckoRepo } from "./runtime/gecko-repo.ts";
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
import { geckoSessionState } from "./runtime/session-state.ts";
import { codeLinkRoutes } from "./server/code-links.ts";

const textLinks = (repo: string) => isGeckoRepo(repo) ? [{ pattern: "\\b[Bb]ug\\s+(\\d+)\\b", url: "https://bugzilla.mozilla.org/show_bug.cgi?id=$1" }] : [];

function server(rt: Runtime, opts: { intervalMs?: number }) {
  const watcher = new TryWatcher(rt, { intervalMs: opts.intervalMs });
  return { routes: [...tryRoutes(rt, watcher), ...codeLinkRoutes(rt)], start() { watcher.start(); } };
}

/** Gecko repo profile, Searchfox code links, try and Phabricator submit phases. */
export const geckoPlugin = definePlugin({ id: "gecko", dependsOn: ["implement", "review", "spec"], repoProfiles: [geckoProfile], deniedMcpServers: ["firefox-devtools"], phases: [tryPhase, tryPushPhase, submitPhase, phabSubmitPhase], tasks: [proposeTry, tryPush, suggestReviewers, phabSubmit], artifactKinds, chatReplyFields: [tryField, submitField], textLinks, sessionState: geckoSessionState, server });
