import { definePlugin } from "../../plugin-api.ts";
import { plainGitProfile } from "./profiles.ts";
import { implementStart } from "./tasks/start/task.ts";
import { implementWorkflow } from "./workflow/implement.ts";

/** Implementation workflow plugin and its generic git profile. */
export const implementPlugin = definePlugin({ id: "implement", dependsOn: ["review"], workflows: [implementWorkflow], tasks: [implementStart], repoProfiles: [plainGitProfile] });
