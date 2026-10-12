import { definePlugin } from "../../plugin-api.ts";
import { scmRoutes } from "./server/routes.ts";

/** Git for the user and for LLM work: refs, history, commits and diffs of the session's or a chosen repository. */
export const scmPlugin = definePlugin({ id: "scm", server: () => ({ routes: scmRoutes() }) });
