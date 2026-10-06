import { importDiff } from "./import-diff/task.ts";
import { narrate } from "./narrate/task.ts";
import { resolveSpecRefs } from "./resolve-spec-refs/task.ts";
import { chatTurn } from "./chat-turn/task.ts";
import { review } from "./review/task.ts";
import { comment } from "./comment/task.ts";

export const tasks = [importDiff, narrate, resolveSpecRefs, chatTurn, review, comment];
