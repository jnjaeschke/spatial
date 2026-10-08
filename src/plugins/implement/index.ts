import { definePlugin } from "../../plugin-api.ts";
import { plainGitProfile } from "./profiles.ts";
import { implementStart } from "./tasks/start/task.ts";
import { investigate } from "./tasks/investigate/task.ts";
import { implement } from "./tasks/implement/task.ts";
import { artifactKinds } from "./runtime/kinds.ts";
import { implementPhase, investigatePhase } from "./workflow/phases.ts";
import { implementWorkflow } from "./workflow/implement.ts";

/** Implementation workflow plugin and its generic git profile. */
export const implementPlugin = definePlugin({ id: "implement", dependsOn: ["review"], workflows: [implementWorkflow], phases: [investigatePhase, implementPhase], tasks: [implementStart, investigate, implement], artifactKinds, repoProfiles: [plainGitProfile] });
