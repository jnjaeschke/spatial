import type { WebPlugin } from "../../../web/plugin-api.ts";
import { ChatView } from "./ChatView.tsx";

export const chatWeb: WebPlugin = { id: "chat", phaseViews: { chat: { Body: ChatView, exportable: () => true } }, workflowPhase: { chat: "chat" } };
