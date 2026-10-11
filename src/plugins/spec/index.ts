import { definePlugin } from "../../plugin-api.ts";
import { artifactKinds, searchKinds } from "./runtime/kinds.ts";

/** Web spec exploration: spec references, algorithms, traces and summaries. */
export const specPlugin = definePlugin({ id: "spec", artifactKinds, searchKinds });
