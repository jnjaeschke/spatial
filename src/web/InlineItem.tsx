import { useContext, useEffect, useRef, type ReactNode } from "react";
import type { HostedThread } from "./graph.ts";
import { IconButton } from "./IconButton.tsx";
import { ChatActionsContext, closeChat, lastTurn } from "./chat-context.ts";
import { isActive } from "../shared/task-state.ts";
import { ClosedContext } from "./closed.ts";
import { Conversation } from "./nodes/ChatNode.tsx";
import { plainText } from "../shared/plain-text.ts";
import { useInlineState } from "./inline-state.ts";

/** An item shown where it applies inside a box, as a line, a preview or its whole body; `onOpenPanel` shows it in a side panel. */
export function InlineItem({ kind, id, who, count, text, badges, dimmed, severity, running, body, onOpenPanel, onClose, testId }: { kind: string; id: string; who: string; count?: number; text: string; badges?: ReactNode; dimmed?: boolean; severity?: string; /** Work on the item is under way, such as an LLM answering its chat. */ running?: boolean; body: ReactNode; onOpenPanel?(): void; onClose?(): void; testId: string }) {
  const [state, setState] = useInlineState(id);
  const expanded = state === "expanded";
  const open = () => setState("expanded");
  const toggle = () => setState(state === "preview" ? "line" : "preview");
  const head = <><span className="inline-who">{who}</span>{badges}{count !== undefined && count > 0 && <small className="inline-count">{count}</small>}</>;
  return <div className={`inline-item nodrag nopan kind-${kind}${severity ? ` severity-${severity}` : ""}${dimmed ? " dismissed" : ""}${running ? " running" : ""} state-${state}`} data-testid={testId} data-state={state} data-thread-boundary="" onDoubleClick={(event) => event.stopPropagation()}>
    <div className="inline-head">
      {head}
      {state === "line" && <button type="button" className="inline-text" onClick={open}>{text}</button>}
      <span className="inline-actions">
        <IconButton label={expanded ? "Collapse item" : state === "line" ? "Show preview" : "Show as line"} type="button" className="link-button" aria-expanded={expanded} onClick={toggle}>{expanded ? "▴" : state === "preview" ? "▾" : "▸"}</IconButton>
        {onOpenPanel && <IconButton label="Open in side panel" type="button" className="link-button" onClick={onOpenPanel}>⤢</IconButton>}
        {onClose && <IconButton label="Close chat" type="button" className="link-button" onClick={onClose}>×</IconButton>}
      </span>
    </div>
    {state === "preview" && <button type="button" className="inline-text inline-preview" onClick={open}>{text}</button>}
    {expanded && <div className="inline-body">{body}</div>}
  </div>;
}

/** A chat thread's quote and conversation; a new draft focuses its composer. */
export function ChatBody({ thread }: { thread: HostedThread }) {
  const body = useRef<HTMLDivElement>(null);
  const draftId = thread.threadId ? null : thread.draftId;
  useEffect(() => { if (draftId) body.current?.querySelector("textarea")?.focus({ preventScroll: true }); }, [draftId]);
  return <div ref={body}>{thread.quote && <blockquote className="chat-quote">{thread.quote.length > 300 ? `${thread.quote.slice(0, 300)}…` : thread.quote}</blockquote>}<Conversation {...thread} /></div>;
}

/** A chat thread hosted inside a box; a new draft shows its composer. */
export function ChatItem({ thread, onOpenPanel }: { thread: HostedThread; onOpenPanel?(): void }) {
  const actions = useContext(ChatActionsContext);
  const closed = useContext(ClosedContext);
  const id = thread.threadId ?? thread.draftId!;
  const last = thread.messages.at(-1);
  const turn = lastTurn(actions?.tasks ?? [], thread);
  const running = !!turn && isActive(turn);
  return <InlineItem kind="chat" id={id} who={running ? "AI" : last?.data.role === "assistant" ? "AI" : "You"} count={thread.messages.length} running={running} text={running ? "Working…" : last ? plainText(last.data.text) : "New chat"} testId={`chat-chip-${id}`} body={<div data-testid={`chat-${id}`}><ChatBody thread={thread} /></div>} onOpenPanel={onOpenPanel} onClose={() => closeChat(thread.threadId, thread.draftId, actions, closed)} />;
}
