import { definePlugin } from "../../plugin-api.ts";
import { geckoProfile } from "./profile.ts";
import { proposeTry } from "./tasks/propose-try/task.ts";
import { tryPhase, tryPushPhase } from "./workflow/try.ts";
import { tryPush } from "./tasks/try-push/task.ts";
import { artifactKinds } from "./runtime/kinds.ts";

/** Gecko repo profile and try phases. */
export const geckoPlugin = definePlugin({ id: "gecko", dependsOn: ["implement"], repoProfiles: [geckoProfile], phases: [tryPhase, tryPushPhase], tasks: [proposeTry, tryPush], artifactKinds });
