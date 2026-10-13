import type { PhaseViewProps } from "../../../web/plugin-api.ts";
import { ReviewView } from "./ReviewView.tsx";

/** Renders round Diffs even when no PatchNarrative exists yet. */
export function RoundView(props: PhaseViewProps) {
  return <ReviewView {...props} projectUnnarrated />;
}
