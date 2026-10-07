import { useContext, useState, type ReactNode } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { LlmSelection } from "../../shared/types.ts";
import { applyRevisions } from "../../shared/revisions.ts";
import { api } from "../api.ts";
import { ChatActionsContext } from "../chat-context.ts";
import type { ChatNodeData, ZoomLevel } from "../graph.ts";
import { LlmPicker } from "../LlmPicker.tsx";
import { AnswerMarkdown } from "../AnswerMarkdown.tsx";
import { CollapseContext } from "../collapse.ts";

export type ChatFlowNode = Node<ChatNodeData & { level: ZoomLevel } & Record<string, unknown>, "chat">;

export function ChatNode({ data }: NodeProps<ChatFlowNode>) {
  const collapse = useContext(CollapseContext);
  const id = data.threadId ?? data.draftId!;
  const closed = data.threadId !== null && (collapse?.collapsed.has(data.threadId) ?? false);

  if (data.level === "patch") {
    return <div className="node chat-node level-patch" data-testid={`chat-${id}`}><Handle type="source" position={Position.Left} /><div className="title">💬 {data.messages.length}{data.threadId && collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(data.threadId!)}>{closed ? "▸" : "▾"}</button>}</div></div>;
  }
  return (
    <div className={`node chat-node level-${data.level}`} data-testid={`chat-${id}`}>
      <Handle type="source" position={Position.Left} />
      <div className="title">Chat{data.messages.length > 0 && ` · ${data.messages.length}`}{data.threadId && collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(data.threadId!)}>{closed ? "▸" : "▾"}</button>}</div>
      {!closed && <>
      {data.quote && <blockquote className="chat-quote">{data.quote.length > 300 ? `${data.quote.slice(0, 300)}…` : data.quote}</blockquote>}
      <Conversation {...data} />
      </>}
    </div>
  );
}

type ConversationProps = Pick<ChatNodeData, "anchor" | "quote" | "lines" | "diffId" | "hunks" | "threadId" | "draftId" | "taskId" | "messages" | "revisions" | "mcpRequests"> & { lead?: ReactNode };

/** Messages and reply form of one chat thread; `lead` renders before the messages. */
export function Conversation(data: ConversationProps) {
  const actions = useContext(ChatActionsContext);
  const lastLlm = data.messages.filter((m) => m.data.role === "assistant").at(-1)?.data.llm;
  const [llm, setLlm] = useState<LlmSelection | null>(lastLlm ?? actions?.models.default ?? null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Without a draft, the anchor has a single conversation (a finding), so its first turn is found by anchor.
  const turns = (actions?.tasks ?? []).filter((t) => t.kind === "chatTurn" && (t.id === data.taskId ||
    (data.threadId !== null && (t.input as { threadId?: string }).threadId === data.threadId) ||
    (data.draftId === null && (t.input as { anchor?: string }).anchor === data.anchor)));
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
            {m.data.role === "assistant" && m.data.diagramError && <p className="revision-errors">Diagram dropped: {m.data.diagramError}</p>}
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
        const selection = llm ?? actions.models.default;
        const body = data.threadId ? { threadId: data.threadId, text, llm: selection } : { anchor: data.anchor, text, llm: selection, ...(data.quote ? { quote: data.quote, lines: data.lines } : {}) };
        api.turn(actions.sessionId, body).then(({ taskId }) => {
          setText("");
          if (data.draftId) actions.onSent(data.draftId, taskId);
        }, (err: Error) => setError(err.message));
      }}>
        <textarea aria-label="message" placeholder="Ask AI — Enter to send, Ctrl+Enter for newline" value={text} onChange={(e) => setText(e.target.value)} rows={2} onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing || e.shiftKey) return;
          e.preventDefault();
          if (e.ctrlKey) {
            const el = e.currentTarget;
            el.setRangeText("\n", el.selectionStart, el.selectionEnd, "end");
            setText(el.value);
          } else if (canSend) {
            e.currentTarget.form!.requestSubmit();
          }
        }} />
        <LlmPicker models={actions.models} value={llm ?? actions.models.default} onChange={setLlm} />
        <button type="submit" disabled={!canSend}>Send</button>
        {error && <span className="failed">{error}</span>}
      </form>}
  </>;
}
