import { readFileSync } from "node:fs";
import type { DiffData, LlmSelection, PatchNarrativeData } from "../../shared/types.ts";
import { defineTask } from "../../runtime/tasks.ts";
import { renderDiffForPrompt } from "./render.ts";
import { validateNarrative } from "./validate.ts";
import schema from "./schema.json" with { type: "json" };

/** Rough budget so a narration fits comfortably in current model context windows. */
export const MAX_PROMPT_CHARS = 300_000;

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");

export const narrate = defineTask<{ diffId: string; llm?: LlmSelection }, { narrativeId: string }>({
  kind: "narrate",
  async run(ctx, { diffId, llm }) {
    const diff = ctx.artifacts.get<DiffData>(diffId);
    if (diff.type !== "Diff") throw new Error(`Artifact ${diffId} is not a Diff (got ${diff.type})`);
    const prompt = renderDiffForPrompt(diff.data);
    if (prompt.length > MAX_PROMPT_CHARS) {
      throw new Error(`Diff too large for narration: ${prompt.length} chars (limit ${MAX_PROMPT_CHARS})`);
    }

    ctx.progress({ kind: "steps", step: "Grouping hunks", index: 0, count: 1 });
    let r = await ctx.llm.run({ prompt, system: SYSTEM, schema, cwd: ctx.repo, tools: "none" }, llm);
    let errors = validateNarrative(r.json, diff.data);
    if (errors.length) {
      ctx.progress({ kind: "steps", step: "Repairing invalid narrative", index: 0, count: 1 });
      const retry = [
        prompt,
        "",
        "Your previous answer was invalid:",
        ...errors.map((e) => `- ${e}`),
        "",
        "Previous answer:",
        JSON.stringify(r.json),
        "",
        "Return a corrected, complete answer.",
      ].join("\n");
      r = await ctx.llm.run({ prompt: retry, system: SYSTEM, schema, cwd: ctx.repo, tools: "none" }, llm);
      errors = validateNarrative(r.json, diff.data);
      if (errors.length) throw new Error(`Narrative failed validation:\n${errors.join("\n")}`);
    }

    const data: PatchNarrativeData = { diffId, ...(r.json as Omit<PatchNarrativeData, "diffId">) };
    const a = ctx.artifacts.put("PatchNarrative", "proposed", data, r.selection);
    ctx.links.put(a.id, diffId, "derivedFrom");
    return { narrativeId: a.id };
  },
});
