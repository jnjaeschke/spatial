import { useContext, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { LlmSelection } from "../../shared/types.ts";
import { api } from "../api.ts";
import { ChatActionsContext } from "../Canvas.tsx";
import type { ChatNodeData, ZoomLevel } from "../graph.ts";
import { LlmPicker } from "../LlmPicker.tsx";

export type ChatFlowNode = Node<ChatNodeData & { level: ZoomLevel } & Record<string, unknown>, "chat">;

export function ChatNode({ data }: NodeProps<ChatFlowNode>) {
  const actions = useContext(ChatActionsContext)!;
  const lastLlm = data.messages.filter((m) => m.data.role === "assistant").at(-1)?.data.llm;
  const [llm, setLlm] = useState<LlmSelection>(lastLlm ?? actions.models.default);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = actions.tasks.some((t) =>
    t.kind === "chatTurn" && (t.status === "running" || t.status === "pending") &&
    ((data.threadId && (t.input as { threadId?: string }).threadId === data.threadId) || (data.draftId && actions.pendingDrafts.has(data.draftId))));
  const failed = actions.tasks.filter((t) => t.kind === "chatTurn" && t.status === "failed" && (t.input as { threadId?: string }).threadId === data.threadId).at(-1);
  const id = data.threadId ?? data.draftId!;

  if (data.level === "patch") {
    return <div className="node chat-node level-patch" data-testid={`chat-${id}`}><Handle type="source" position={Position.Left} />💬 {data.messages.length}</div>;
  }
  return (
    <div className={`node chat-node level-${data.level}`} data-testid={`chat-${id}`}>
      <Handle type="source" position={Position.Left} />
      <div className="messages nodrag nopan nowheel">
        {data.messages.map((m) => (
          <div key={m.id} className={`msg ${m.data.role}`}>
            {m.data.text}
            {m.data.llm && <span className="msg-llm">{m.data.llm.backend}/{m.data.llm.model}/{m.data.llm.effort}</span>}
          </div>
        ))}
        {busy && <div className="msg pending">…</div>}
        {failed && !busy && <div className="msg failed">{failed.error}</div>}
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
