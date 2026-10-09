import { PhaseBusyError, workflowView, type Artifact, type Epoch, type Id, type Runtime, type WorkflowStartData } from "../../../plugin-api.ts";
import type { PhabCommentData } from "../../review/api.ts";
import type { ReviewerCommentsInput } from "../shared/types.ts";

/** Reviewer comments not yet interpreted: latest version per phid, not by the user or done, and in no earlier comments epoch. */
export function newReviewerComments(view: { artifacts: Artifact[]; epochs: Epoch[] }): string[] {
  const seen = new Set(view.epochs.filter((e) => e.phase === "reviewerComments").flatMap((e) => (e.input as ReviewerCommentsInput).comments));
  const latest = new Map<string, PhabCommentData>();
  for (const a of view.artifacts) if (a.type === "PhabComment") {
    const comment = a.data as PhabCommentData;
    latest.delete(comment.phid);
    latest.set(comment.phid, comment);
  }
  return [...latest.values()].filter((c) => !c.byMe && !c.done && !seen.has(c.phid)).map((c) => c.phid);
}

/** Starts comment interpretation when a watched implement session becomes idle with new comments. */
export class CommentWatcher {
  #rt: Runtime;
  #pending = new Set<Id>();
  #errors = new Map<Id, string>();
  #unsubscribe: (() => void) | undefined;
  constructor(rt: Runtime) { this.#rt = rt; }
  start(): void {
    if (this.#unsubscribe) return;
    this.#unsubscribe = this.#rt.onEvent((event) => {
      if (event.type !== "artifact.created" && !event.type.startsWith("epoch.")) return;
      try { if (this.#rt.store.getSession(event.sessionId).workflow !== "implement") return; } catch { return; }
      if (this.#pending.has(event.sessionId)) return;
      this.#pending.add(event.sessionId);
      setTimeout(() => { this.#pending.delete(event.sessionId); void this.check(event.sessionId); }, 0);
    });
  }
  stop(): void { this.#unsubscribe?.(); this.#unsubscribe = undefined; }
  async check(sessionId: Id): Promise<void> {
    const rt = this.#rt;
    if (rt.store.getSession(sessionId).workflow !== "implement" || rt.runningEpoch(sessionId) || rt.nextStep(sessionId) !== null) return;
    const view = workflowView(rt.store, sessionId);
    const comments = newReviewerComments(view);
    if (!comments.length) return;
    const llm = (view.artifacts.findLast((a) => a.type === "WorkflowStart")?.data as WorkflowStartData | undefined)?.llm;
    try {
      await rt.runPhase(sessionId, "reviewerComments", { comments, ...(llm ? { llm } : {}) } satisfies ReviewerCommentsInput);
      await rt.advance(sessionId);
      this.#errors.delete(sessionId);
    } catch (e) {
      if (e instanceof PhaseBusyError) return;
      const message = (e as Error).message;
      if (message !== this.#errors.get(sessionId)) { console.error(`reviewer comments failed in session ${sessionId}: ${message}`); this.#errors.set(sessionId, message); }
    }
  }
}
