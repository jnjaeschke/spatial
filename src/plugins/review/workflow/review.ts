import { z } from "zod";
import type { Id, LlmSelection, Epoch } from "../../../shared/types.ts";
import type { Runtime, Phase } from "../../../runtime/tasks.ts";
import type { Workflow } from "../../../plugin-api.ts";
import type { SessionView } from "../../../runtime/render-ref.ts";
import { parseRevisionRef } from "../shared/phabricator.ts";
import { diffsOf, interdiffOf, narrativeOf } from "../shared/diffs.ts";
import { narrateDiff } from "./narrate-patch.ts";
import { reviewOverview } from "../runtime/review-kinds.ts";

const params = z.strictObject({ base: z.string().min(1).nullable(), head: z.string().min(1).nullable(), revision: z.string().nullable() }).refine((p) => p.revision !== null ? p.base === null && p.head === null && parseRevisionRef(p.revision) !== null : (p.base === null) === (p.head === null), "Give either a revision or both refs");
type Params = z.infer<typeof params>;
export function parseReviewArgs(args: string): { ok: true; params: Params } | { ok: false; error: string } {
  const text = args.trim();
  if (!text) return { ok: true, params: { base: null, head: null, revision: null } };
  if (parseRevisionRef(text)) return { ok: true, params: { base: null, head: null, revision: text } };
  const range = /^(\S+?)\.\.(\S+)$/.exec(text);
  if (range && !text.includes("...")) return { ok: true, params: { base: range[1]!, head: range[2]!, revision: null } };
  return { ok: false, error: "Usage: /review [D-number | base..head]" };
}

export interface ReviewPhaseInput { base: string; head: string; update: boolean; diffId?: Id; llm?: LlmSelection }

export const reviewPhase: Phase<ReviewPhaseInput> = {
  id: "review",
  async run(rt: Runtime, sessionId: Id, { base, head, update, diffId: given, llm }, epoch: Epoch) {
    const artifacts = rt.store.listArtifacts(sessionId);
    const own = diffsOf(artifacts).filter((diff) => diff.epoch === epoch.n).at(-1);
    const diffId = given ?? own?.id ?? (await rt.run<{ diffId: Id }>(sessionId, "importDiff", { base, head })).diffId;
    const all = rt.store.listArtifacts(sessionId);
    const previous = diffsOf(all).filter((diff) => diff.id !== diffId).at(-1);
    if (update && previous && !interdiffOf(all, rt.store.listLinks(sessionId), diffId)) {
      await rt.run(sessionId, "interdiff", { fromDiffId: previous.id, toDiffId: diffId });
    }
    await narrateDiff(rt, sessionId, diffId, llm);
  },
};

const workflow: Workflow<Params> = {
  id: "review", description: "Review a local patch: analyze and review the changes between a base and a head git ref (for example main and a feature branch), or a Phabricator revision (D123, or its URL) whose stack is imported without checking it out. With no refs it reviews the uncommitted changes in the work tree, or the latest commit when there are none.", argHint: "[D-number | base..head]", params, parseArgs: parseReviewArgs,
  async start(rt: Runtime, sessionId: Id, { params: p, llm }) {
    let range: { base: string; head: string };
    if (p.revision !== null) {
      const { host, id } = parseRevisionRef(p.revision)!;
      range = await rt.run<{ base: string; head: string }>(sessionId, "importRevision", { host, id });
    } else {
      range = p.base !== null && p.head !== null ? { base: p.base, head: p.head } : await rt.run<{ base: string; head: string }>(sessionId, "reviewRange", {});
    }
    await rt.runPhase(sessionId, "review", { ...range, update: false, llm });
  },
  overview: reviewOverview,
};

export const reviewWorkflow = workflow;
