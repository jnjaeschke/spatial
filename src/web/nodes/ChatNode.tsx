import { useContext, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { LlmSelection } from "../../shared/types.ts";
import { api } from "../api.ts";
import { ChatActionsContext } from "../chat-context.ts";
import type { ChatNodeData, ZoomLevel } from "../graph.ts";
import { LlmPicker } from "../LlmPicker.tsx";
import { CodeSpan } from "../CodeSpan.tsx";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type ChatFlowNode = Node<ChatNodeData & { level: ZoomLevel } & Record<string, unknown>, "chat">;

export function ChatNode({ data }: NodeProps<ChatFlowNode>) {
  const actions = useContext(ChatActionsContext)!;
  const lastLlm = data.messages.filter((m) => m.data.role === "assistant").at(-1)?.data.llm;
  const [llm, setLlm] = useState<LlmSelection>(lastLlm ?? actions.models.default);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const turns = actions.tasks.filter((t) => t.kind === "chatTurn" &&
    (t.id === data.taskId || (data.threadId !== null && (t.input as { threadId?: string }).threadId === data.threadId)));
  const last = turns.at(-1);
  const busy = last?.status === "running" || last?.status === "pending";
  const failed = last?.status === "failed" ? last : undefined;
  const id = data.threadId ?? data.draftId!;

  if (data.level === "patch") {
    return <div className="node chat-node level-patch" data-testid={`chat-${id}`}><Handle type="source" position={Position.Left} />💬 {data.messages.length}</div>;
  }
  return (
    <div className={`node chat-node level-${data.level}`} data-testid={`chat-${id}`}>
      <Handle type="source" position={Position.Left} />
      <div className="messages body nodrag nopan nowheel">
        {data.messages.map((m) => (
          <div key={m.id} className={`msg ${m.data.role}`}>
            {m.data.role === "assistant"
              ? <Markdown remarkPlugins={[remarkGfm]} components={{
                code: ({ className, children }) => {
                  const code = String(children);
                  return className?.startsWith("language-") || /[\r\n]/.test(code)
                    ? <code className={className}>{children}</code>
                    : <CodeSpan text={code} hunks={data.hunks} diffId={data.diffId} />;
                },
                a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
              }}>{m.data.text}</Markdown>
              : m.data.text}
            {m.data.llm && <span className="msg-llm">{m.data.llm.backend}/{m.data.llm.model}/{m.data.llm.effort}</span>}
          </div>
        ))}
        {busy && <div className="msg pending">…</div>}
        {failed && <div className="msg failed">{failed.error}</div>}
      </div>
      <form className="nodrag nopan" onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const body = data.threadId ? { threadId: data.threadId, text, llm } : { anchor: data.anchor, text, llm };
        api.turn(actions.sessionId, body).then(({ taskId }) => {
          setText("");
          if (data.draftId) actions.onSent(data.draftId, taskId);
        }, (err: Error) => setError(err.message));
      }}>
        <textarea aria-label="message" value={text} onChange={(e) => setText(e.target.value)} rows={2} />
        <LlmPicker models={actions.models} value={llm} onChange={setLlm} />
        <button type="submit" disabled={busy || !text.trim()}>Send</button>
        {error && <span className="failed">{error}</span>}
      </form>
    </div>
  );
}
