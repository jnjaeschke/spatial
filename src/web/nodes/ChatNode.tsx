import { IconButton } from "../IconButton.tsx";
import { TaskControls } from "../TaskControls.tsx";
import { Fragment, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { Artifact, DecisionData, LlmSelection } from "../../shared/types.ts";
import { applyRevisions } from "../../shared/revisions.ts";
import { isActive } from "../../shared/task-state.ts";
import { api } from "../api.ts";
import { ChatActionsContext, closeChat, lastTurn } from "../chat-context.ts";
import type { ChatNodeData } from "../graph.ts";
import { LlmPicker } from "../LlmPicker.tsx";
import { rememberLlm } from "../llm-choice.ts";
import { AnswerMarkdown } from "../AnswerMarkdown.tsx";
import { CollapseContext } from "../collapse.ts";
import { ClosedContext } from "../closed.ts";
import { Box } from "../Box.tsx";
import { Composer, useDraftText } from "../Composer.tsx";
import { COMPOSER_HINT } from "../composer-key.ts";
import { ErrorText, useAction } from "../action.tsx";
import { ReplyActionsContext } from "../reply-actions.ts";
import { interleave } from "../conversation-items.ts";
import { optionProblem } from "../decisions.ts";
import { OpenActivityLogContext } from "../activity-log-context.ts";

export type ChatFlowNode = Node<ChatNodeData & Record<string, unknown>, "chat">;

export function ChatNode({ id: nodeId, data }: NodeProps<ChatFlowNode>) {
  const closer = useContext(ClosedContext);
  const actions = useContext(ChatActionsContext);
  const id = data.threadId ?? data.draftId!;
  const turn = lastTurn(actions?.tasks ?? [], data);
  return (
    <Box kind="chat" testId={`chat-${id}`} handles={{ source: Position.Left }} title={<>Chat{data.messages.length > 0 && ` · ${data.messages.length}`}{turn && isActive(turn) && <span className="title-running"> · working…</span>}</>} collapse={data.threadId ? { key: data.threadId } : undefined} onClose={closer ? () => closeChat(data.threadId, data.draftId, actions, closer) : undefined}>
      {data.quote && <blockquote className="chat-quote">{data.quote.length > 300 ? `${data.quote.slice(0, 300)}…` : data.quote}</blockquote>}
      <Conversation {...data} />
    </Box>
  );
}

export type ConversationProps = Pick<ChatNodeData, "anchor" | "quote" | "lines" | "diffId" | "hunks" | "threadId" | "draftId" | "taskId" | "messages" | "revisions" | "mcpRequests" | "diagramsByMessage" | "aside"> & { lead?: ReactNode; /** Shows Steer and Stop & steer beside Send: Steer hands the text to the running agent, Stop & steer stops the running epoch and steers its rerun. */ canSteer?: boolean; /** An open decision, shown as the newest message with its options as buttons; an option's text is the reply box's text, its model the picker's. */ decision?: Artifact<DecisionData> | null; /** Plugin artifacts shown among the messages in creation order, rendered by `renderItem`. */ items?: Artifact[]; renderItem?(artifact: Artifact): ReactNode };

/** Keeps the newest message in view: a new own message or decision scrolls to the end, a new answer scrolls to its start just below the pinned own message. */
function useFollowLatest(list: RefObject<HTMLDivElement | null>, latest: ChatNodeData["messages"][number] | undefined, busy: boolean, decisionId: string | undefined) {
  const followed = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (decisionId !== undefined && followed.current !== decisionId) { el.scrollTop = el.scrollHeight; followed.current = decisionId; return; }
    if (!latest) return;
    if (latest.data.role === "user") { el.scrollTop = el.scrollHeight; followed.current = latest.id; return; }
    if (followed.current === latest.id) return;
    followed.current = latest.id;
    const node = el.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(latest.id)}"]`);
    if (node) scrollBelowPinned(el, node);
  }, [list, latest, busy, decisionId]);
}

/** Scrolls `list` so that `node` starts just below the pinned own message. Positions are measured in screen pixels, which the canvas zoom scales. */
function scrollBelowPinned(list: HTMLElement, node: HTMLElement) {
  const scale = list.getBoundingClientRect().height / list.offsetHeight || 1;
  const pinned = list.querySelector<HTMLElement>(".msg.pinned");
  const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
  list.scrollTop += (node.getBoundingClientRect().top - list.getBoundingClientRect().top) / scale - (pinned ? pinned.offsetHeight + gap : 0);
}

/** Messages and reply form of one chat thread; `lead` renders before the messages; the last own message stays pinned at the top while its answer scrolls, and clicking it scrolls back to the answer's start. */
export function Conversation(data: ConversationProps) {
  const actions = useContext(ChatActionsContext);
  const replyActions = useContext(ReplyActionsContext);
  const collapse = useContext(CollapseContext);
  const closer = useContext(ClosedContext);
  const openLog = useContext(OpenActivityLogContext);
  const lastLlm = data.messages.filter((m) => m.data.role === "assistant").at(-1)?.data.llm;
  const [llm, setLlm] = useState<LlmSelection | null>(lastLlm ?? actions?.models.default ?? null);
  const [text, setText] = useDraftText(data.draftId);
  const { busy: deciding, error, run, fail, clear } = useAction();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const decision = data.decision ?? null;
  const defaultText = decision?.data.options.find((option) => option.defaultText)?.defaultText;
  useEffect(() => { if (defaultText !== undefined) setText(defaultText); }, [decision?.id]);
  const last = lastTurn(actions?.tasks ?? [], data);
  const busy = !!last && isActive(last);
  const failed = last?.status === "failed" ? last : undefined;
  const cancelled = last?.status === "cancelled";
  const canSend = !busy && text.trim() !== "";
  const entries = interleave(data.messages, data.items ?? []);
  const pinnedId = data.messages.findLast((m) => m.data.role === "user")?.id;
  const list = useRef<HTMLDivElement>(null);
  useFollowLatest(list, data.messages.at(-1), busy, decision?.id);
  return <>
      <div ref={list} className="messages body nodrag nopan nowheel">
        {data.lead}
        {entries.map((entry) => { if ("item" in entry) return <Fragment key={entry.item.id}>{data.renderItem?.(entry.item)}</Fragment>; const m = entry.message; return (
          <div key={m.id} className={`msg ${m.data.role}${m.id === pinnedId ? " pinned" : ""}`} data-anchor={m.id} title={m.id === pinnedId ? "Show the start of the answer" : undefined} onClick={m.id === pinnedId ? (e) => {
            const next = e.currentTarget.nextElementSibling;
            if (list.current && next instanceof HTMLElement && window.getSelection()?.isCollapsed !== false) scrollBelowPinned(list.current, next);
          } : undefined}>
            {m.data.role === "assistant"
              ? <AnswerMarkdown text={applyRevisions(m.data.text, data.revisions[m.id] ?? [])} hunks={data.hunks} diffId={data.diffId} />
              : m.data.text}
            {m.data.role === "assistant" && m.data.questions?.length ? <ul className="chat-questions">{m.data.questions.map((question, i) => <li key={i}>{question}</li>)}</ul> : null}
            {m.data.role === "assistant" && m.data.revisionErrors?.length ? <p className="revision-errors">{m.data.revisionErrors.map((revisionError, i) => <span key={i}>{i > 0 ? " " : ""}Could not apply revision: {revisionError}</span>)}</p> : null}
            {m.data.role === "assistant" && m.data.replyErrors?.map(({ label, error }) => <p className="revision-errors" key={label}>{label} dropped: {error}</p>)}
            {m.data.role === "assistant" && replyActions?.derived(m.id).map((artifact) => { const Action = replyActions.components[artifact.type]; return Action ? <Action key={artifact.id} artifact={artifact} sessionId={replyActions.sessionId} /> : null; })}
            {m.data.role === "assistant" && (data.diagramsByMessage?.[m.id] ?? []).map((diagramId) => <IconButton label="Show diagram" key={diagramId} type="button" className="show-diagram nodrag" onClick={() => { closer?.reopen([diagramId]); collapse?.reveal(diagramId, `diagram:${diagramId}`); }}>Show diagram</IconButton>)}
            {m.data.role === "assistant" && (m.data.llm || openLog) && <span className="msg-llm">{m.data.llm && `${m.data.llm.backend}/${m.data.llm.model}/${m.data.llm.effort}`}{openLog && <button type="button" className="link-button nodrag" title="What the LLM did for this answer" onClick={() => openLog({ taskId: m.provenance.taskId })}>Log</button>}</span>}
          </div>
        ); })}
        {decision && <div className="msg decision" data-testid="session-decision">
          <span className="decision-question">{decision.data.question}</span>
          <span className="decision-options">{decision.data.options.map((option) => {
            const problem = optionProblem(option, option.takesText ? text : "");
            return <button key={option.id} type="button" className="nodrag" disabled={deciding || problem !== null} title={problem ?? undefined} onClick={() => {
              const selection = llm ?? actions?.models.default;
              if (option.takesModel && selection) rememberLlm(selection);
              void run(async () => {
                await api.decide(decision.sessionId, decision.id, option.id, { ...(option.takesText && text.trim() ? { text: text.trim() } : {}), ...(option.takesModel && selection ? { llm: selection } : {}) });
                if (option.takesText) setText("");
              });
            }}>{option.label}</button>;
          })}</span>
        </div>}
        {last && busy && <div className="msg pending"><span className="pending-dots">…</span><TaskControls task={last} /></div>}
        {failed && <div className="msg failed">{failed.error}</div>}
        {cancelled && <div className="msg cancelled">Cancelled</div>}
      </div>
      {actions && data.threadId !== null && data.mcpRequests.map((server) => (
        <div key={server} className="enable-mcp-request">
          <span>Enable <code>{server}</code> for this chat?</span>
          <button className="enable-mcp nodrag" type="button" onClick={() => void run(() => api.enableMcpServer(actions.sessionId, data.threadId!, server))}>Enable</button>
        </div>
      ))}
      {actions && <form className="nodrag nopan" onSubmit={(e) => {
        e.preventDefault();
        clear();
        const note = data.aside && data.draftId ? /^\/note(?:\s+|$)([\s\S]*)$/.exec(text.trim()) : null;
        if (note) {
          const body = note[1]!.trim();
          if (!body) { fail("A note needs a body"); return; }
          void run(async () => { const { artifactId } = await api.note(actions.sessionId, body); actions.onNote(data.draftId!, artifactId); });
          return;
        }
        const selection = llm ?? actions.models.default;
        rememberLlm(selection);
        const body = data.threadId ? { threadId: data.threadId, text, llm: selection } : { anchor: data.anchor, text, llm: selection, ...(data.aside ? { aside: true } : {}), ...(data.quote ? { quote: data.quote, lines: data.lines } : {}) };
        void run(async () => {
          const { taskId } = await api.turn(actions.sessionId, body);
          setText("");
          if (data.draftId) actions.onSent(data.draftId, taskId);
        });
      }}>
        <Composer textareaRef={textarea} label="message" placeholder={`Ask AI — ${COMPOSER_HINT}`} value={text} onChange={setText} rows={2} canSubmit={canSend} onSubmit={() => textarea.current?.form?.requestSubmit()} />
        <LlmPicker models={actions.models} value={llm ?? actions.models.default} onChange={setLlm} />
        <button type="submit" disabled={!canSend}>Send</button>
        {data.canSteer && <>
          <button type="button" disabled={text.trim() === ""} title="Tell the running agent without stopping it; it reads this after its current step" onClick={() => void run(async () => { await api.steer(actions.sessionId, text, true); setText(""); })}>Steer</button>
          <button type="button" disabled={text.trim() === ""} title="Stop the agent now and rerun it with this" onClick={() => void run(async () => { await api.steer(actions.sessionId, text); setText(""); })}>Stop &amp; steer</button>
        </>}
        <ErrorText error={error} />
      </form>}
  </>;
}
