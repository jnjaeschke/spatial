import { readFileSync } from "node:fs";
import type { ChangeStatus, DiffData, InterdiffData, LlmSelection, PatchNarrativeData } from "../../shared/types.ts";
import { defineTask } from "../../runtime/tasks.ts";
import { prependRepoContext } from "../../runtime/repo-context.ts";
import { renderDiffForPrompt, renderHunk } from "./render.ts";
import { changeStatus, hunkStatuses } from "../../shared/change-status.ts";
import { validateNarrative } from "./validate.ts";
import schema from "./schema.json" with { type: "json" };

/** Rough budget so a narration fits comfortably in current model context windows. */
export const MAX_PROMPT_CHARS = 300_000;

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const UPDATE_SYSTEM = readFileSync(new URL("./prompt-update.md", import.meta.url), "utf8");

export const narrate = defineTask<{ diffId: string; llm?: LlmSelection; update?: { previousNarrativeId: string; interdiffId: string } }, { narrativeId: string }>({
  kind: "narrate",
  async run(ctx, { diffId, llm, update }) {
    const diff = ctx.artifacts.get<DiffData>(diffId);
    if (diff.type !== "Diff") throw new Error(`Artifact ${diffId} is not a Diff (got ${diff.type})`);
    let prompt: string;
    let systemPrompt = SYSTEM;
    let statuses: Map<string, ChangeStatus> | undefined;
    if (update) {
      const previous = ctx.artifacts.get<PatchNarrativeData>(update.previousNarrativeId);
      if (previous.type !== "PatchNarrative") throw new Error(`Artifact ${update.previousNarrativeId} is not a PatchNarrative (got ${previous.type})`);
      const interdiff = ctx.artifacts.get<InterdiffData>(update.interdiffId);
      if (interdiff.type !== "Interdiff") throw new Error(`Artifact ${update.interdiffId} is not an Interdiff (got ${interdiff.type})`);
      if (previous.data.diffId !== interdiff.data.fromDiff || interdiff.data.toDiff !== diffId) throw new Error("Interdiff does not connect the previous narrative to this diff");
      const prev = ctx.artifacts.get<DiffData>(interdiff.data.fromDiff);
      if (prev.type !== "Diff") throw new Error(`Artifact ${interdiff.data.fromDiff} is not a Diff (got ${prev.type})`);
      statuses = hunkStatuses(diff.data, prev.data, interdiff.data);
      const previousChanges = previous.data.changes.map((change) => {
        const paths = prev.data.files.filter((file) => file.hunks.some((hunk) => change.hunkIds.includes(hunk.id))).map((file) => file.path);
        return `- ${change.id} ${change.title}: ${change.explanation}\n  files: ${[...new Set(paths)].join(", ")}`;
      });
      const interdiffHunks = interdiff.data.files.flatMap((file) => file.hunks.map((hunk) => renderHunk(file, { ...hunk, id: `I-${hunk.id}` }).trimEnd()));
      prompt = [renderDiffForPrompt(diff.data, statuses), "# Previous narrative", "", previous.data.summary, ...previousChanges, "", "# Interdiff (what the author changed since the previous revision)", "", ...interdiffHunks, ...(interdiff.data.conflicts.length ? ["Conflicts: " + interdiff.data.conflicts.join(", ")] : [])].join("\n");
      systemPrompt = UPDATE_SYSTEM;
    } else {
      prompt = renderDiffForPrompt(diff.data);
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      throw new Error(`Diff too large for narration: ${prompt.length} chars (limit ${MAX_PROMPT_CHARS})`);
    }

    ctx.progress({ kind: "steps", step: "Grouping hunks", index: 0, count: 1 });
    const mcpServers = { ...ctx.sessionMcp, ...ctx.repoMcp };
    const system = prependRepoContext(systemPrompt, ctx);
    let r = await ctx.llm.run({ prompt, system, schema, cwd: ctx.repo, tools: "read-only", mcpServers }, llm);
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
      r = await ctx.llm.run({ prompt: retry, system, schema, cwd: ctx.repo, tools: "read-only", mcpServers }, llm);
      errors = validateNarrative(r.json, diff.data);
      if (errors.length) throw new Error(`Narrative failed validation:\n${errors.join("\n")}`);
    }

    const json = r.json as Omit<PatchNarrativeData, "diffId">;
    const changes = statuses ? json.changes.map((change) => ({ ...change, status: changeStatus(change.hunkIds, statuses!) })) : json.changes;
    const data: PatchNarrativeData = { diffId, ...json, changes, ...(update ? { previous: update.previousNarrativeId } : {}) };
    const a = ctx.artifacts.put("PatchNarrative", "proposed", data, r.selection);
    ctx.links.put(a.id, diffId, "derivedFrom");
    return { narrativeId: a.id };
  },
});
