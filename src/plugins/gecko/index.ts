import { definePlugin } from "../../plugin-api.ts";
import { geckoProfile } from "./profile.ts";
import { proposeTry } from "./tasks/propose-try/task.ts";
import { tryPhase } from "./workflow/try.ts";
import { artifactKinds } from "./runtime/kinds.ts";

/** Gecko repo profile and the try phase. */
export const geckoPlugin = definePlugin({ id: "gecko", dependsOn: ["implement"], repoProfiles: [geckoProfile], phases: [tryPhase], tasks: [proposeTry], artifactKinds });
