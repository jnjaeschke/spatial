import { sessionProfile, sessionView, type Artifact, type DiffData, type Id, type LlmSelection, type Runtime } from "../../../plugin-api.ts";
import type { InterdiffData } from "../shared/types.ts";
import { diffsOf, diffNumber, narrativeOf } from "../shared/diffs.ts";
import { mappableSpecs } from "../tasks/map-spec-steps/task.ts";

/** narrate → (carryFindings) → resolveSpecRefs → review for an imported Diff, with introducedSymbols, mapSpecSteps for each spec section with steps and, when the repo profile can fetch bugs, fetchBugs → summarizeBug alongside the review. */
export async function narrateDiff(rt: Runtime, sessionId: Id, diffId: Id, llm?: LlmSelection, recheck?: Id[]): Promise<void> {
  const symbols = rt.run(sessionId, "introducedSymbols", { diffId }).catch(() => undefined);
  const artifacts = rt.store.listArtifacts(sessionId);
  const number = diffNumber(artifacts, diffId);
  const update = await updateFrom(rt, sessionId, diffId, false);
  const { narrativeId } = await rt.run<{ narrativeId: Id }>(sessionId, "narrate", { diffId, llm, ...(update ? { update } : {}) });
  if (number >= 2) await rt.run(sessionId, "carryFindings", { narrativeId });
  await rt.run(sessionId, "resolveSpecRefs", { narrativeId });
  const diff = rt.store.getArtifact<DiffData>(diffId).data;
  const namesBug = diff.commits.some((commit) => /\bBug \d+\b/i.test(commit.subject));
  // Failed mappings and bug lookups stay visible on their task records; the review is complete without them.
  const profile = await sessionProfile(rt.plugins.repoProfiles, sessionView(rt.store, sessionId), rt.store.getSession(sessionId).worktree);
  const bugs = profile.fetchBug && namesBug
    ? rt.run<{ reportIds: Id[] }>(sessionId, "fetchBugs", { diffId }).then(({ reportIds }) => Promise.allSettled(reportIds.map((reportId) => rt.run(sessionId, "summarizeBug", { reportId, llm })))).catch(() => undefined)
    : Promise.resolve();
  const view = { artifacts: rt.store.listArtifacts(sessionId), links: rt.store.listLinks(sessionId) };
  const mappings = Promise.allSettled(mappableSpecs(view, narrativeId).map((specId) => rt.run(sessionId, "mapSpecSteps", { narrativeId, specId, llm })));
  await rt.run(sessionId, "review", { narrativeId, llm, ...(recheck ? { recheck } : {}) });
  await Promise.all([mappings, bugs, symbols]);
}

/** Update-mode input against the newest Diff before `diffId` that has a narrative, when an interdiff between the two exists; with `compute`, runs `interdiff` when none does. The review phase computes its interdiff before narrating, so only round narration computes here. */
async function updateFrom(rt: Runtime, sessionId: Id, diffId: Id, compute: boolean): Promise<{ previousNarrativeId: Id; interdiffId: Id } | undefined> {
  const artifacts = rt.store.listArtifacts(sessionId);
  const diffs = diffsOf(artifacts);
  const index = diffs.findIndex((diff) => diff.id === diffId);
  if (index < 0) return undefined;
  const earlier = diffs.slice(0, index).reverse();
  const previous = earlier.map((diff) => narrativeOf(artifacts, diff.id)).find((narrative) => narrative !== null);
  if (!previous) return undefined;
  const existing = (artifacts.filter((a) => a.type === "Interdiff") as Artifact<InterdiffData>[]).find((a) => a.data.fromDiff === previous.data.diffId && a.data.toDiff === diffId);
  if (!existing && !compute) return undefined;
  const interdiffId = existing?.id ?? (await rt.run<{ interdiffId: Id }>(sessionId, "interdiff", { fromDiffId: previous.data.diffId, toDiffId: diffId })).interdiffId;
  return { previousNarrativeId: previous.id, interdiffId };
}

/** Narration of a Diff without a review: introducedSymbols, narrate (update mode against the newest narrated earlier Diff), carryFindings in update mode, resolveSpecRefs. */
export async function narrateRound(rt: Runtime, sessionId: Id, diffId: Id, llm?: LlmSelection): Promise<void> {
  const symbols = rt.run(sessionId, "introducedSymbols", { diffId }).catch(() => undefined);
  const update = await updateFrom(rt, sessionId, diffId, true);
  const { narrativeId } = await rt.run<{ narrativeId: Id }>(sessionId, "narrate", { diffId, llm, ...(update ? { update } : {}) });
  if (update) await rt.run(sessionId, "carryFindings", { narrativeId });
  await rt.run(sessionId, "resolveSpecRefs", { narrativeId });
  await symbols;
}
