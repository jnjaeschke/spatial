import { importDiff } from "./import-diff/task.ts";
import { narrate } from "./narrate/task.ts";
import { resolveSpecRefs } from "./resolve-spec-refs/task.ts";

export const tasks = [importDiff, narrate, resolveSpecRefs];
