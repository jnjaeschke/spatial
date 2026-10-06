import { importDiff } from "./import-diff/task.ts";
import { narrate } from "./narrate/task.ts";
import { resolveSpecRefs } from "./resolve-spec-refs/task.ts";
import { chatTurn } from "./chat-turn/task.ts";
import { review } from "./review/task.ts";
import { comment } from "./comment/task.ts";
import { interdiff } from "./interdiff/task.ts";
import { carryFindings } from "./carry-findings/task.ts";
import { selectWorkflow } from "./select-workflow/task.ts";

export const tasks = [importDiff, narrate, resolveSpecRefs, chatTurn, review, comment, interdiff, carryFindings, selectWorkflow];
