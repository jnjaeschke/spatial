import { useContext, useState } from "react";
import { type Graph, type ChatActions, api, SidePanel, ChatActionsContext, AnswerMarkdown, Conversation, Composer, ErrorText, useAction } from "../../../web/plugin-api.ts";
import { findingsOf, type FindingData } from "./graph.ts";

/** Finds the finding of a finding detail. */
export function findFinding(graph: Graph | null, id: string): FindingData | null {
  for (const node of graph?.nodes ?? []) {
    const finding = findingsOf(node.data).find((item) => item.findingId === id);
    if (finding) return finding;
  }
  return null;
}

/** The finding, its decision and comment, and its conversation. */
export function FindingDetails({ data, actions, onClose, onBack }: { data: FindingData; actions: ChatActions | null; onClose(): void; onBack?(): void }) {
  return <ChatActionsContext.Provider value={actions}>
    <SidePanel className="review-detail-panel" title={`Finding · ${data.severity}`} closeLabel="Close finding panel" testId="finding-panel" onClose={onClose}
      onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); onClose(); } }}
      headerExtra={onBack && <button aria-label="Back" onClick={onBack}>←</button>}>
      <FindingBody data={data} />
    </SidePanel>
  </ChatActionsContext.Provider>;
}

/** The finding with its decision controls, comment editor and conversation. */
export function FindingBody({ data }: { data: FindingData }) {
  const actions = useContext(ChatActionsContext);
  const { error, run } = useAction();
  const dismissed = data.decision === "dismissed";
  const statusLabel = data.status === "partially" ? "partially addressed" : data.status === "not_addressed" ? "not addressed" : data.status;
  const finding = <div className="msg assistant finding-body"><AnswerMarkdown text={data.body} hunks={data.hunks} diffId={data.diffId} /></div>;
  const decide = (decision: "accepted" | "dismissed") => {
    if (actions) void run(() => api.decideFinding(actions.sessionId, data.findingId, decision, actions.models.default));
  };
  return <section className={`finding-details severity-${data.severity}${dismissed ? " dismissed" : ""}${data.outdated ? " outdated" : ""}`} data-testid={`finding-details-${data.findingId}`}>
    <header className="finding-detail-title"><span className={`badge severity-${data.severity}`}>{data.severity}</span><span className="category">{data.category}</span>{!data.ai && <span className="badge muted" title="Found by the runtime, not an LLM">spec check</span>}{data.status !== "open" && <span className={`badge status-${data.status}`} data-testid="finding-status">{statusLabel}</span>}{data.outdated && <span className="badge outdated" data-testid="finding-outdated">outdated</span>}{data.fromEpoch !== null && <span className="epoch-marker" data-testid="finding-epoch">epoch {data.fromEpoch}</span>}<strong>{data.title}</strong></header>
    {actions && <div className="finding-actions">{data.decision !== "accepted" && <button aria-label="Accept finding" className="accept" onClick={() => decide("accepted")}>Accept</button>}{data.decision !== "dismissed" && <button aria-label="Dismiss finding" className="dismiss" onClick={() => decide("dismissed")}>Dismiss</button>}</div>}
    {data.verdict && <div className="verdict-reason" data-testid="finding-verdict">{data.verdict.reason}</div>}
    <ErrorText error={error} />
    {!dismissed && <>
      {actions
        ? <Conversation anchor={data.findingId} diffId={data.diffId} hunks={data.hunks} threadId={data.thread?.threadId ?? null} draftId={null} taskId={data.thread?.taskId ?? null} messages={data.thread?.messages ?? []} revisions={data.thread?.revisions ?? {}} mcpRequests={data.thread?.mcpRequests ?? []} lead={finding} />
        : <div className="messages body">{finding}</div>}
      {data.decision === "accepted" && <CommentEditor key={data.comment?.id ?? "none"} findingId={data.findingId} comment={data.comment} postedTo={data.postedTo} />}
    </>}
  </section>;
}

function CommentEditor({ findingId, comment, postedTo }: Pick<FindingData, "findingId" | "comment" | "postedTo">) {
  const actions = useContext(ChatActionsContext);
  const [body, setBody] = useState(comment?.body ?? "");
  const { busy: saving, error, run } = useAction();
  const tasks = actions?.tasks.filter((task) => task.kind === "comment" && (task.input as { findingId?: string }).findingId === findingId) ?? [];
  const latestTask = tasks.at(-1);
  const busy = latestTask?.status === "running" || latestTask?.status === "pending";
  const save = () => { if (actions) void run(() => api.saveComment(actions.sessionId, findingId, body)); };
  const regenerate = () => { if (actions) void run(() => api.regenerateComment(actions.sessionId, findingId, actions.models.default)); };
  const taskError = latestTask?.status === "failed" ? latestTask.error : null;
  if (!comment && busy) return <div className="comment-draft">Generating comment…</div>;
  if (!comment && taskError) return <div className="comment-draft failed">{taskError}</div>;
  return <div className="comment-draft">
    <Composer label="Comment" value={body} onChange={setBody} canSubmit={!!actions && !!body.trim() && !saving && !busy} onSubmit={save} />
    <div><button type="button" onClick={save} disabled={!actions || !body.trim() || saving || busy}>Save</button><button type="button" onClick={regenerate} disabled={!actions || busy || saving}>Regenerate</button></div>
    <div className="comment-status">{busy ? "Regenerating…" : comment?.status === "proposed" ? "Draft — save to make it postable" : postedTo !== null ? `Posted to D${postedTo}` : comment ? "Ready to post" : "No comment yet"}</div>
    <ErrorText error={error} />
    {taskError && <div className="failed">{taskError}</div>}
  </div>;
}
