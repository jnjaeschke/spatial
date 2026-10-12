import { useContext, useEffect } from "react";
import type { SessionState } from "../shared/types.ts";
import type { PhaseView } from "./plugin-api.ts";
import { ChatActionsContext, type ChatActions } from "./chat-context.ts";
import { DecisionControls, ModelsContext } from "./DecisionControls.tsx";
import { IconButton } from "./IconButton.tsx";
import { MainConversation } from "./MainConversation.tsx";
import { openDecision } from "./decisions.ts";
import { conversationNode, latestStart, rootThread, type ConversationNodeData } from "./graph.ts";

/** Whether the footer offers the session chat: the session has a request and the phase view does not show the conversation itself. */
export const hasSessionChip = (state: SessionState, view: PhaseView | null) => state.session.workflow !== null && !view?.conversationOnCanvas && latestStart(state) !== undefined;

const shownKey = (decisionId: string) => `spatial:decision-shown:${decisionId}`;

/** The footer chip of the session chat: idle, running (an epoch runs) or pending (a decision is open and the popover closed). A decision opens the popover once, when it appears or the page loads with it open. */
export function SessionChip({ state, open, onOpen }: { state: SessionState; open: boolean; onOpen(open: boolean): void }) {
  const decision = openDecision(state.artifacts);
  const decisionId = decision?.id;
  useEffect(() => {
    if (decisionId === undefined || sessionStorage.getItem(shownKey(decisionId)) !== null) return;
    sessionStorage.setItem(shownKey(decisionId), "1");
    onOpen(true);
  }, [decisionId, onOpen]);
  const running = state.epochs.some((epoch) => epoch.status === "running");
  const dataState = running ? "running" : decision && !open ? "pending" : "idle";
  return <button type="button" className="session-chip" data-testid="session-chip" data-state={dataState} aria-expanded={open} title="The session's main chat" onClick={() => onOpen(!open)}>Session</button>;
}

/** The main conversation of the session with its open decision above it. Not a select-to-ask scope: the reply form is the way to ask here. */
export function SessionPopover({ state, onClose }: { state: SessionState; onClose(): void }) {
  const models = useContext(ModelsContext);
  const decision = openDecision(state.artifacts);
  const start = latestStart(state)!;
  const data = conversationNode(state, start, rootThread(state, start.id)).data as ConversationNodeData;
  const actions: ChatActions | null = models && { models, sessionId: state.session.id, tasks: state.tasks, onSent() {}, onDiscard() {}, onNote() {} };
  return <section className="activity-log session-log" role="dialog" aria-label="Session" data-testid="session-popover" data-no-ask="" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
    <header><b>Session</b><IconButton label="Close session" onClick={onClose}>×</IconButton></header>
    <div className="session-log-body">
      {decision && <DecisionControls key={decision.id} sessionId={state.session.id} decision={decision} testId="session-decision" />}
      <ChatActionsContext.Provider value={actions}><MainConversation data={data} /></ChatActionsContext.Provider>
    </div>
  </section>;
}
