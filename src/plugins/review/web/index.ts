import type { WebPlugin } from "../../../web/plugin-api.ts";
import { latestNarrative } from "../../../web/plugin-api.ts";
import { latestDiff } from "../shared/diffs.ts";
import { isStaleNotice } from "./notices.ts";
import { ReviewView } from "./ReviewView.tsx";

export const reviewWeb: WebPlugin = {
  id: "review",
  phaseViews: { review: { Body: ReviewView, exportable: (state) => !!latestNarrative(state), isStaleNotice: (state, notice) => isStaleNotice(notice, latestDiff(state.artifacts)) } },
  workflowPhase: { review: "review" },
};
