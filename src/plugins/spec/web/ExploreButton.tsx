import { ErrorText, showSessionView, useAction, type ReplyActionProps } from "../../../web/plugin-api.ts";
import type { SpecExploreRequestData } from "../shared/types.ts";
import { specClient } from "./client.ts";

/** Opens the sections a chat reply proposed as root boxes and switches to the spec explorer; Back returns to where the chat was. */
export function ExploreButton({ artifact, sessionId }: ReplyActionProps) {
  const { anchors } = artifact.data as SpecExploreRequestData;
  const action = useAction();
  return <><button type="button" className="spec-explore nodrag" data-testid="spec-explore" disabled={action.busy} onClick={() => void action.run(async () => { await specClient.explore(sessionId, artifact.id); showSessionView("spec"); })}>Explore {anchors[0]}{anchors.length > 1 ? ` and ${anchors.length - 1} more` : ""}</button><ErrorText error={action.error} /></>;
}
