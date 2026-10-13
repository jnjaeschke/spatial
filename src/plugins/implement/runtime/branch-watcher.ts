import { latestArtifact, workflowView, type DiffData, type GitCapability, type Id, type NotifyPayload, type Runtime, type WorkflowView } from "../../../plugin-api.ts";
import type { AdoptInput, AdoptPlanData, AdoptRangeInput, ImplementBranchData } from "../shared/types.ts";
import { sessionBug } from "../workflow/next.ts";
import { relatedBranches } from "./adopt.ts";

export type BranchState = { kind: "same" } | { kind: "moved"; tip: string } | { kind: "renamed"; candidates: string[] } | { kind: "gone" };

/** Heads the session produced, imported or adopted from; any other branch tip was made outside spatial. */
function knownHeads(view: WorkflowView): Set<string> {
  const heads = new Set<string>();
  for (const a of view.artifacts) {
    if (a.type === "Diff") heads.add((a.data as DiffData).headSha);
    if (a.type === "ImplementResult" || a.type === "PhabSubmission") heads.add((a.data as { head: string }).head);
  }
  for (const epoch of view.epochs.filter((e) => e.phase === "adoptRange")) {
    const range = epoch.input as AdoptRangeInput;
    const plan = view.artifacts.find((a) => a.id === range.planId)?.data as AdoptPlanData | undefined;
    const tip = plan?.branches.find((b) => b.branch === range.branch)?.tip;
    if (tip) heads.add(tip);
  }
  return heads;
}

/** Where the session's branch is now compared with what the session knows. */
export async function branchState(git: GitCapability, view: WorkflowView): Promise<BranchState | null> {
  const branch = latestArtifact<ImplementBranchData>(view.artifacts, "ImplementBranch")?.data;
  if (!branch) return null;
  let tip: string | null = null;
  try { tip = await git.resolve(`refs/heads/${branch.branch}`); } catch { tip = null; }
  if (tip !== null) return knownHeads(view).has(tip) ? { kind: "same" } : { kind: "moved", tip };
  const known = new Set<string>();
  for (const a of view.artifacts.filter((a) => a.type === "Diff")) {
    const diff = a.data as DiffData;
    for (const item of await git.patchIds(diff.baseSha, diff.headSha).catch(() => [])) known.add(item.patchId);
  }
  const refs = [branch.baseRef, branch.baseSha, ...await git.mainlineRefs()].filter((ref): ref is string => !!ref);
  const candidates = await relatedBranches(git, await git.branches(), { refs, bug: sessionBug(view), knownPatchIds: known });
  return candidates.length ? { kind: "renamed", candidates } : { kind: "gone" };
}

export const adoptMode = (state: BranchState): AdoptInput["mode"] | null => state.kind === "same" ? null : state.kind === "gone" ? "choose" : state.kind;

/** Notifies watched implement sessions whose branch moved, or vanished, outside spatial. */
export class BranchWatcher {
  #rt: Runtime;
  #intervalMs: number;
  #watchers = new Map<Id, number>();
  #announced = new Map<Id, string>();
  #errors = new Map<Id, string>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #ticking = false;
  constructor(rt: Runtime, opts: { intervalMs?: number } = {}) { this.#rt = rt; this.#intervalMs = opts.intervalMs ?? 10_000; }
  /** Marks `sessionId` as watched (reference counted) until the returned function is called. */
  watch(sessionId: Id): () => void {
    this.#watchers.set(sessionId, (this.#watchers.get(sessionId) ?? 0) + 1);
    let active = true;
    return () => { if (!active) return; active = false; const count = this.#watchers.get(sessionId) ?? 0; if (count <= 1) { this.#watchers.delete(sessionId); this.#announced.delete(sessionId); this.#errors.delete(sessionId); } else this.#watchers.set(sessionId, count - 1); };
  }
  /** One polling pass; resolves when done. Never rejects. */
  async tick(): Promise<void> {
    if (this.#ticking) return;
    this.#ticking = true;
    try {
      for (const id of this.#watchers.keys()) {
        try {
          if (this.#rt.store.getSession(id).workflow !== "implement" || this.#rt.runningEpoch(id) || this.#rt.store.listArtifacts(id, "Abandoned").length) continue;
          const view = workflowView(this.#rt.store, id), state = await branchState(this.#rt.gitFor(id), view);
          this.#errors.delete(id);
          if (!state || state.kind === "same") { this.#announced.delete(id); continue; }
          const branch = latestArtifact<ImplementBranchData>(view.artifacts, "ImplementBranch")!.data.branch;
          const payload = notice(id, state, branch);
          if (this.#announced.get(id) === payload.id) continue;
          this.#announced.set(id, payload.id);
          this.#rt.emit(id, "runtime", "notify", payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message !== this.#errors.get(id)) { console.error(`branch watcher failed for session ${id}: ${message}`); this.#errors.set(id, message); }
        }
      }
    } finally { this.#ticking = false; }
  }
  start(): void { if (this.#timer) return; this.#timer = setInterval(() => void this.tick(), this.#intervalMs); this.#timer.unref(); }
  stop(): void { if (this.#timer) clearInterval(this.#timer); this.#timer = undefined; }
}

function notice(sessionId: Id, state: Exclude<BranchState, { kind: "same" }>, branch: string): NotifyPayload {
  const path = `/api/sessions/${sessionId}/adopt`;
  if (state.kind === "moved") return { id: `branch-moved:${state.tip}`, title: `Branch ${branch} moved outside spatial`, action: { label: "Adopt", path } };
  if (state.kind === "renamed") return { id: `branch-renamed:${state.candidates.join(",")}`, title: `Branch ${branch} is gone; found ${state.candidates.join(", ")}`, action: { label: "Adopt", path } };
  return { id: `branch-gone:${branch}`, title: `Branch ${branch} is gone and no related branch was found`, action: { label: "Choose branch", path } };
}
