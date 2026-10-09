import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { LlmSelection } from "../../shared/types.ts";
import { applyRevisions } from "../../shared/revisions.ts";
import { api } from "../api.ts";
import { ChatActionsContext, closeChat } from "../chat-context.ts";
import type { ChatNodeData, ZoomLevel } from "../graph.ts";
import { LlmPicker } from "../LlmPicker.tsx";
import { AnswerMarkdown } from "../AnswerMarkdown.tsx";
import { CollapseContext } from "../collapse.ts";
import { ClosedContext } from "../closed.ts";
import { ReopenClosed } from "../ReopenClosed.tsx";
import { Box } from "../Box.tsx";
import { Composer, useDraftText } from "../Composer.tsx";
import { COMPOSER_HINT } from "../composer-key.ts";

export type ChatFlowNode = Node<ChatNodeData & { level: ZoomLevel } & Record<string, unknown>, "chat">;

export function ChatNode({ id: nodeId, data }: NodeProps<ChatFlowNode>) {
  const closer = useContext(ClosedContext);
  const actions = useContext(ChatActionsContext);
  const id = data.threadId ?? data.draftId!;

  if (data.level === "patch") {
    return <Box kind="chat" level="patch" testId={`chat-${id}`} title={<>💬 {data.messages.length}</>} handles={{ source: Position.Left }} collapse={data.threadId ? { key: data.threadId } : undefined} />;
  }
  return (
    <Box kind="chat" level={data.level} testId={`chat-${id}`} handles={{ source: Position.Left }} title={<>Chat{data.messages.length > 0 && ` · ${data.messages.length}`}</>} collapse={data.threadId ? { key: data.threadId } : undefined} onClose={closer ? () => closeChat(data.threadId, data.draftId, actions, closer) : undefined}>
      {data.quote && <blockquote className="chat-quote">{data.quote.length > 300 ? `${data.quote.slice(0, 300)}…` : data.quote}</blockquote>}
      <Conversation {...data} />
      <ReopenClosed hostId={nodeId} />
    </Box>
  );
}

export type ConversationProps = Pick<ChatNodeData, "anchor" | "quote" | "lines" | "diffId" | "hunks" | "threadId" | "draftId" | "taskId" | "messages" | "revisions" | "mcpRequests" | "diagramsByMessage" | "aside"> & { lead?: ReactNode };

/** Messages and reply form of one chat thread; `lead` renders before the messages. */
export function Conversation(data: ConversationProps) {
  const actions = useContext(ChatActionsContext);
  const collapse = useContext(CollapseContext);
  const closer = useContext(ClosedContext);
  const lastLlm = data.messages.filter((m) => m.data.role === "assistant").at(-1)?.data.llm;
  const [llm, setLlm] = useState<LlmSelection | null>(lastLlm ?? actions?.models.default ?? null);
  const [text, setText] = useDraftText(data.draftId);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // Without a draft, the anchor has a single conversation (a finding), so its first turn is found by anchor.
  const turns = (actions?.tasks ?? []).filter((t) => {
    if (t.kind !== "chatTurn") return false;
    const input = t.input as { threadId?: string; anchor?: string; aside?: boolean };
    return t.id === data.taskId || (data.threadId !== null && input.threadId === data.threadId) ||
      (data.threadId === null && data.draftId === null && input.anchor === data.anchor && !input.aside);
  });
  const last = turns.at(-1);
  const busy = last?.status === "running" || last?.status === "pending";
  const failed = last?.status === "failed" ? last : undefined;
  const canSend = !busy && text.trim() !== "";
  return <>
      <div className="messages body nodrag nopan nowheel">
        {data.lead}
        {data.messages.map((m) => (
          <div key={m.id} className={`msg ${m.data.role}`} data-anchor={m.id}>
            {m.data.role === "assistant"
              ? <AnswerMarkdown text={applyRevisions(m.data.text, data.revisions[m.id] ?? [])} hunks={data.hunks} diffId={data.diffId} />
              : m.data.text}
            {m.data.role === "assistant" && m.data.questions?.length ? <ul className="chat-questions">{m.data.questions.map((question, i) => <li key={i}>{question}</li>)}</ul> : null}
            {m.data.role === "assistant" && m.data.revisionErrors?.length ? <p className="revision-errors">{m.data.revisionErrors.map((revisionError, i) => <span key={i}>{i > 0 ? " " : ""}Could not apply revision: {revisionError}</span>)}</p> : null}
            {m.data.role === "assistant" && m.data.replyErrors?.map(({ label, error }) => <p className="revision-errors" key={label}>{label} dropped: {error}</p>)}
            {m.data.role === "assistant" && (data.diagramsByMessage?.[m.id] ?? []).map((diagramId) => <button key={diagramId} type="button" aria-label="Show diagram" className="show-diagram nodrag" onClick={() => { closer?.reopen([diagramId]); collapse?.reveal(diagramId, `diagram:${diagramId}`); }}>Show diagram</button>)}
            {m.data.llm && <span className="msg-llm">{m.data.llm.backend}/{m.data.llm.model}/{m.data.llm.effort}</span>}
          </div>
        ))}
        {busy && <div className="msg pending">…</div>}
        {failed && <div className="msg failed">{failed.error}</div>}
      </div>
      {actions && data.threadId !== null && data.mcpRequests.map((server) => (
        <div key={server} className="enable-mcp-request">
          <span>Enable <code>{server}</code> for this chat?</span>
          <button className="enable-mcp nodrag" type="button" onClick={() => api.enableMcpServer(actions.sessionId, data.threadId!, server).catch((err: Error) => setError(err.message))}>Enable</button>
        </div>
      ))}
      {actions && <form className="nodrag nopan" onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const note = data.aside && data.draftId ? /^\/note(?:\s+|$)([\s\S]*)$/.exec(text.trim()) : null;
        if (note) {
          const body = note[1]!.trim();
          if (!body) { setError("A note needs a body"); return; }
          api.note(actions.sessionId, body).then(({ artifactId }) => actions.onNote(data.draftId!, artifactId), (err: Error) => setError(err.message));
          return;
        }
        const selection = llm ?? actions.models.default;
        const body = data.threadId ? { threadId: data.threadId, text, llm: selection } : { anchor: data.anchor, text, llm: selection, ...(data.aside ? { aside: true } : {}), ...(data.quote ? { quote: data.quote, lines: data.lines } : {}) };
        api.turn(actions.sessionId, body).then(({ taskId }) => {
          setText("");
          if (data.draftId) actions.onSent(data.draftId, taskId);
        }, (err: Error) => setError(err.message));
      }}>
        <Composer textareaRef={textarea} label="message" placeholder={`Ask AI — ${COMPOSER_HINT}`} value={text} onChange={setText} rows={2} canSubmit={canSend} onSubmit={() => textarea.current?.form?.requestSubmit()} />
        <LlmPicker models={actions.models} value={llm ?? actions.models.default} onChange={setLlm} />
        <button type="submit" disabled={!canSend}>Send</button>
        {error && <span className="failed">{error}</span>}
      </form>}
  </>;
}
