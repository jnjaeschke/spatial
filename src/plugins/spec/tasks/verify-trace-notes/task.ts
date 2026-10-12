import { defineTask } from "../../../../plugin-api.ts";
import { runVerdicts } from "../verdicts.ts";
import type { NoteResult } from "../../shared/types.ts";
import { DATA_PREAMBLE, fence } from "../../shared/prompt.ts";

const SYSTEM = "You check notes on a trace through web spec algorithms adversarially. Each note claims something about one algorithm step. Decide whether the step text and quoted code lines given with it support the note: anything they do not state, or state differently, is unsupported. Give a one-sentence reason per note.";

/** An adversarial LLM verdict per trace note against the text of its step. */
export const verifyTraceNotes = defineTask<{ traceId: string; items: { anchor: string; step: string; stepText: string; note: string; code: string[] }[] }, { notes: NoteResult[] }>({
  kind: "verifyTraceNotes",
  async run(ctx, { items }) {
    const prompt = [DATA_PREAMBLE, ...items.map((item, index) => [`## Note ${index + 1}: ${item.anchor} step ${item.step}`, fence(item.note), "", "Step text:", fence(item.stepText), ...(item.code.length ? ["", "Code:", fence(item.code.join("\n"))] : [])].join("\n"))].join("\n\n");
    return { notes: await runVerdicts(ctx, { field: "notes", count: items.length, system: SYSTEM, prompt, label: "Note verdicts" }) };
  },
});
