import { useContext, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { api, ChatActionsContext, CollapseContext, type ZoomLevel, AnswerMarkdown, Conversation } from "../../../../web/plugin-api.ts";
import type { FindingNodeData } from "../graph.ts";

export type FindingFlowNode = Node<FindingNodeData & { level: ZoomLevel } & Record<string, unknown>, "finding">;

export function FindingNode({ data }: NodeProps<FindingFlowNode>) {
  const actions = useContext(ChatActionsContext);
  const collapse = useContext(CollapseContext);
  const [error, setError] = useState<string | null>(null);
  const closed = collapse?.collapsed.has(data.findingId) ?? false;
  const dismissed = data.decision === "dismissed";
  const statusLabel = data.status === "partially" ? "partially addressed" : data.status === "not_addressed" ? "not addressed" : data.status;
  const finding = <div className="msg assistant finding-body"><AnswerMarkdown text={data.body} hunks={data.hunks} diffId={data.diffId} /></div>;
  const decide = (decision: "accepted" | "dismissed") => {
    if (!actions) return;
    setError(null);
    api.decide(actions.sessionId, data.findingId, decision, actions.models.default).catch((e: Error) => setError(e.message));
  };
  return <div className={`node finding-node severity-${data.severity} level-${data.level}${dismissed ? " dismissed" : ""}${data.outdated ? " outdated" : ""}`} data-testid={`finding-${data.findingId}`} data-anchor={data.findingId}>
    <Handle type="source" position={Position.Left} />
    <div className="title"><span className={`badge severity-${data.severity}`}>{data.severity}</span><span className="category">{data.category}</span>{!data.ai && <span className="badge muted" title="Found by the runtime, not an LLM">spec check</span>}{data.status !== "open" && <span className={`badge status-${data.status}`} data-testid="finding-status">{statusLabel}</span>}{data.outdated && <span className="badge outdated" data-testid="finding-outdated">outdated</span>}{data.fromEpoch !== null && <span className="epoch-marker" data-testid="finding-epoch">epoch {data.fromEpoch}</span>}{data.title}{data.thread && ` · ${data.thread.messages.length}`}{actions && data.decision !== "accepted" && <button aria-label="Accept finding" className="accept nodrag" onClick={() => decide("accepted")}>Accept</button>}{actions && data.decision !== "dismissed" && <button aria-label="Dismiss finding" className="dismiss nodrag" onClick={() => decide("dismissed")}>Dismiss</button>}{collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(data.findingId)}>{closed ? "▸" : "▾"}</button>}</div>
    {data.verdict && <div className="verdict-reason" data-testid="finding-verdict">{data.verdict.reason}</div>}
    {error && <div className="failed">{error}</div>}
    {!dismissed && !closed && data.level !== "patch" && <>
      {actions
        ? <Conversation anchor={data.findingId} diffId={data.diffId} hunks={data.hunks} threadId={data.thread?.threadId ?? null} draftId={null} taskId={data.thread?.taskId ?? null} messages={data.thread?.messages ?? []} revisions={data.thread?.revisions ?? {}} mcpRequests={data.thread?.mcpRequests ?? []} lead={finding} />
        : <div className="messages body nodrag nopan nowheel">{finding}</div>}
      {data.decision === "accepted" && <CommentEditor key={data.comment?.id ?? "none"} findingId={data.findingId} comment={data.comment} postedTo={data.postedTo} />}
    </>}
  </div>;
}

function CommentEditor({ findingId, comment, postedTo }: Pick<FindingNodeData, "findingId" | "comment" | "postedTo">) {
  const actions = useContext(ChatActionsContext);
  const [body, setBody] = useState(comment?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tasks = actions?.tasks.filter((task) => task.kind === "comment" && (task.input as { findingId?: string }).findingId === findingId) ?? [];
  const latestTask = tasks.at(-1);
  const busy = latestTask?.status === "running" || latestTask?.status === "pending";
  const save = () => {
    if (!actions) return;
    setError(null);
    setSaving(true);
    api.saveComment(actions.sessionId, findingId, body).catch((e: Error) => setError(e.message)).finally(() => setSaving(false));
  };
  const regenerate = () => {
    if (!actions) return;
    setError(null);
    api.regenerateComment(actions.sessionId, findingId, actions.models.default).catch((e: Error) => setError(e.message));
  };
  const taskError = latestTask?.status === "failed" ? latestTask.error : null;
  if (!comment && busy) return <div className="comment-draft">Generating comment…</div>;
  if (!comment && taskError) return <div className="comment-draft failed">{taskError}</div>;
  return <div className="comment-draft nodrag nopan nowheel">
    <textarea aria-label="Comment" value={body} onChange={(e) => setBody(e.target.value)} />
    <div><button type="button" onClick={save} disabled={!actions || !body.trim() || saving || busy}>Save</button><button type="button" onClick={regenerate} disabled={!actions || busy || saving}>Regenerate</button></div>
    <div className="comment-status">{busy ? "Regenerating…" : comment?.status === "proposed" ? "Draft — save to make it postable" : postedTo !== null ? `Posted to D${postedTo}` : comment ? "Ready to post" : "No comment yet"}</div>
    {(error ?? taskError) && <div className="failed">{error ?? taskError}</div>}
  </div>;
}
