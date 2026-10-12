import { ErrorText, showSessionView, useAction, type ReplyActionProps } from "../../../web/plugin-api.ts";
import type { SpecExploreRequestData } from "../shared/types.ts";
import { specClient } from "./client.ts";
import { showTrace } from "./trace-state.ts";

/** Opens the sections a chat reply proposed as root boxes and switches to the spec explorer; Back returns to where the chat was. */
export function ExploreButton({ artifact, sessionId }: ReplyActionProps) {
  const { anchors, question } = artifact.data as SpecExploreRequestData;
  const action = useAction();
  return <><button type="button" className="spec-explore nodrag" data-testid="spec-explore" disabled={action.busy} onClick={() => void action.run(async () => { const { traceId } = await specClient.explore(sessionId, artifact.id); if (traceId) showTrace(sessionId, traceId); showSessionView("spec"); })}>Explore {anchors[0]}{anchors.length > 1 ? ` and ${anchors.length - 1} more` : ""}{question ? " and trace" : ""}</button><ErrorText error={action.error} /></>;
}
