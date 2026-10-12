import type { Artifact, DecisionData, Epoch, Phase, Step, WorkflowView } from "../../../plugin-api.ts";
import type { TryInput, TryProposalData, TryPushInput } from "../shared/types.ts";
import { TRY_TEXT_PATTERN } from "../runtime/try-command.ts";

/** The Push decision's question; it names the tip, because a push started from chat sends whatever HEAD was then. */
export const pushQuestion = (head: string) => `Push ${head.slice(0, 12)} to try?`;

/** After a `try` epoch: ask Push (the proposed command, editable) or Skip; Push runs `tryPush` once. */
export function tryNext(view: WorkflowView, epoch: Epoch): Step | null {
  const proposal = view.artifacts.findLast((a) => a.type === "TryProposal" && a.epoch === epoch.n) as Artifact<TryProposalData> | undefined;
  if (!proposal) return null;
  const head = (epoch.input as TryInput).head, question = pushQuestion(head);
  const chosen = (view.artifacts.findLast((a) => a.type === "Decision" && a.epoch === epoch.n && (a.data as DecisionData).key === "push" && (a.data as DecisionData).chosen) as Artifact<DecisionData> | undefined)?.data.chosen;
  if (!chosen) return { decide: { key: "push", question, options: [
    { id: "push", label: "Push", takesText: true, requiresText: true, defaultText: proposal.data.command, textPattern: TRY_TEXT_PATTERN },
    { id: "skip", label: "Skip" },
  ] } };
  if (chosen.option !== "push" || view.epochs.some((e) => e.phase === "tryPush" && e.n > epoch.n)) return null;
  const input: TryPushInput = { command: (chosen.text ?? "").trim(), head, proposalId: proposal.id };
  return { run: "tryPush", input };
}

export const tryPhase: Phase<TryInput> = { id: "try", async run(rt, sessionId, input) { await rt.run(sessionId, "proposeTry", input); }, next: tryNext };

export const tryPushPhase: Phase<TryPushInput> = { id: "tryPush", async run(rt, sessionId, input) { await rt.run(sessionId, "tryPush", input); } };
