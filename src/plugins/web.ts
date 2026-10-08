import type { WebPlugin } from "../web/plugin-api.ts";
import { ChatView } from "./chat/web/ChatView.tsx";
import { ReviewView } from "./review/web/ReviewView.tsx";
import { latestNarrative } from "../web/graph.ts";
import { isStaleNotice } from "../web/notifications.ts";
import { latestDiff } from "./review/shared/diffs.ts";

export const webPlugins: WebPlugin[] = [
  { id: "review", phaseViews: { review: { Body: ReviewView, exportable: (state) => !!latestNarrative(state), isStaleNotice: (state, notice) => isStaleNotice(notice, latestDiff(state.artifacts)) } }, workflowPhase: { review: "review" } },
  { id: "chat", phaseViews: { chat: { Body: ChatView, exportable: () => true } }, workflowPhase: { chat: "chat" } },
];
