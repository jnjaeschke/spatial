import { readFileSync } from "node:fs";
import { type Artifact, type CommandRunData, type Id, type JsonSchema, defineTask, latestArtifact, runStructured } from "../../../../plugin-api.ts";
import type { InvestigationData, SteerData } from "../../shared/types.ts";
import { currentMemories, distillProblems, type DistillReply } from "../../runtime/memories.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as JsonSchema;

/** `taskId` is the stopped task whose last progress lines show what the agent was doing. */
export interface DistillInput { steerId: Id; taskId: Id | null }

/** Proposes the memory a steer expresses; the caller writes it. */
export const distillSteer = defineTask<DistillInput, DistillReply>({
  kind: "distillSteer",
  async run(ctx, { steerId, taskId }) {
    const view = ctx.artifacts.view();
    const steer = view.artifacts.find((a) => a.id === steerId) as Artifact<SteerData> | undefined;
    if (!steer) throw new Error(`Unknown steer ${steerId}`);
    const before = view.artifacts.slice(0, view.artifacts.indexOf(steer));
    const kind = latestArtifact<InvestigationData>(before, "Investigation")?.data.kind;
    const commands = (before.filter((a) => a.type === "CommandRun" && a.epoch === steer.data.epoch) as Artifact<CommandRunData>[]).slice(-20);
    const progress = taskId ? ctx.events.recent(taskId, 30) : [];
    const existing = currentMemories(ctx.knowledge, ctx.repoDir, ctx.sessionId);
    const prompt = [
      "# Steer", steer.data.text,
      "# Phase", steer.data.phase,
      ...(kind ? ["# Investigation kind", kind] : []),
      "# Commands the stopped run had executed", commands.length ? commands.map((c) => `- \`${c.data.command}\` exited ${c.data.exitCode}`).join("\n") : "None.",
      "# Last progress of the stopped run", progress.length ? progress.map((line) => `- ${line}`).join("\n") : "None.",
      "# Current memories", existing.length ? existing.map((m) => `- ${m.scope} ${m.key}: when ${m.memory.situation}: ${m.memory.wanted}`).join("\n") : "None.",
    ].join("\n\n");
    const { json } = await runStructured<DistillReply>(ctx.llm, { prompt, system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "none", label: "Steer distillation", repairs: 1, validate: (reply) => distillProblems(reply as DistillReply, existing) });
    return json;
  },
});
