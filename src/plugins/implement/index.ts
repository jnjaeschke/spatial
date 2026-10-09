import { definePlugin } from "../../plugin-api.ts";
import { plainGitProfile } from "./profiles.ts";
import { implementStart } from "./tasks/start/task.ts";
import { investigate } from "./tasks/investigate/task.ts";
import { implement } from "./tasks/implement/task.ts";
import { artifactKinds } from "./runtime/kinds.ts";
import { interpretComments } from "./tasks/interpret-comments/task.ts";
import { implementPhase, investigatePhase, reviewerCommentsPhase } from "./workflow/phases.ts";
import { implementWorkflow } from "./workflow/implement.ts";

/** Implementation workflow plugin and its generic git profile. */
export const implementPlugin = definePlugin({ id: "implement", dependsOn: ["review"], workflows: [implementWorkflow], phases: [investigatePhase, implementPhase, reviewerCommentsPhase], tasks: [implementStart, investigate, implement, interpretComments], artifactKinds, repoProfiles: [plainGitProfile] });
