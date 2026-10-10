import { useEffect, useRef } from "react";
import { type Draft, type HostedThread, type Graph, Conversation, SidePanel, ChatActionsContext, ClosedContext, CollapseContext, closeChat, type useClosed, type ChatActions } from "../../../web/plugin-api.ts";

/** Finds the hosted chat of a chat detail. A draft is followed to its thread through the task of its first turn, which outlives the draft. */
export function useChatLookup(graph: Graph | null, drafts: Draft[]): (id: string) => HostedThread | null {
  const sentDrafts = useRef(new Map<string, string>());
  useEffect(() => {
    for (const draft of drafts) if (draft.taskId) sentDrafts.current.set(draft.id, draft.taskId);
  }, [drafts]);
  return (id) => {
    const taskId = drafts.find((item) => item.id === id)?.taskId ?? sentDrafts.current.get(id);
    for (const node of graph?.nodes ?? []) {
      if ("threads" in node.data && Array.isArray(node.data.threads)) {
        const thread = (node.data.threads as HostedThread[]).find((item) => (item.threadId ?? item.draftId) === id || (taskId !== undefined && item.taskId === taskId));
        if (thread) return thread;
      }
    }
    return null;
  };
}

/** Panel × and Escape dismiss the panel (an empty draft is discarded); the header × closes the chat itself. */
export function ChatDetails({ thread, actions, closed, reveal, onClose, onBack }: {
  thread: HostedThread;
  actions: ChatActions | null;
  closed: ReturnType<typeof useClosed>;
  reveal(nodeId: string, collapseId: string): void;
  onClose(): void;
  onBack?(): void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const draftId = thread.threadId ? null : thread.draftId;
  useEffect(() => { if (draftId) body.current?.querySelector("textarea")?.focus(); }, [draftId]);
  const dismiss = () => closeChat(thread.threadId, thread.draftId, actions, { close: onClose });
  return <ChatActionsContext.Provider value={actions}>
    <ClosedContext.Provider value={{ close: closed.close, reopen: closed.reopen, closedOn: new Map() }}>
      <CollapseContext.Provider value={{ collapsed: new Set(), toggle: () => {}, reveal }}>
        <SidePanel className="review-detail-panel" bodyRef={body} title={`Chat · ${thread.messages.length}`} closeLabel="Close chat panel" testId="chat-panel" onClose={dismiss}
          onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); dismiss(); } }}
          headerExtra={<>{onBack && <button aria-label="Back" onClick={onBack}>←</button>}<button aria-label="Close chat" onClick={() => closeChat(thread.threadId, thread.draftId, actions, { close: (id) => { closed.close(id); onClose(); } })}>×</button></>}>
          {thread.quote && <blockquote className="chat-quote">{thread.quote.length > 300 ? `${thread.quote.slice(0, 300)}…` : thread.quote}</blockquote>}<Conversation {...thread} />
        </SidePanel>
      </CollapseContext.Provider>
    </ClosedContext.Provider>
  </ChatActionsContext.Provider>;
}
