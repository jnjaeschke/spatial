import type { PhaseViewProps } from "../../../web/plugin-api.ts";
import type { RoundPhaseInput } from "../api.ts";
import { commentsAsOf } from "../shared/rounds.ts";
import { ReviewView } from "./ReviewView.tsx";

/** Renders round Diffs even when no PatchNarrative exists yet, with the Phabricator comments as of the next submit. */
export function RoundView(props: PhaseViewProps) {
  const until = props.epoch?.phase === "round" ? (props.epoch.input as RoundPhaseInput).until : undefined;
  const state = until === undefined ? props.state : { ...props.state, artifacts: commentsAsOf(props.state.artifacts, until) };
  return <ReviewView {...props} state={state} projectUnnarrated />;
}
