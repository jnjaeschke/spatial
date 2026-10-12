import { useContext } from "react";
import { ChatActionsContext, ErrorText, IconButton, TaskControls, isActive, routeUrl, useAction, type ConversationItemProps } from "../../../web/plugin-api.ts";
import type { MemoryNoticeData, MemoryReactionData, SteerData } from "../shared/types.ts";
import { memoriesClient } from "./client.ts";

/** What the user said when stopping the running phase; while its memory is being distilled, that task's controls, afterwards why it did not finish. */
export function SteerItem({ artifact }: ConversationItemProps) {
  const distill = useContext(ChatActionsContext)?.tasks.findLast((t) => t.kind === "distillSteer" && (t.input as { steerId?: string }).steerId === artifact.id);
  return <>
    <div className="msg user steer-item" data-testid="steer-item"><span className="steer-label">{(artifact.data as SteerData).live ? "Steered" : "Stopped and steered"}</span> {(artifact.data as SteerData).text}</div>
    {distill && isActive(distill) && <div className="msg pending" data-testid="steer-remembering"><span className="pending-dots">Remembering…</span><TaskControls task={distill} /></div>}
    {distill?.status === "failed" && <div className="msg failed" data-testid="steer-remember-failed">{distill.error}</div>}
    {distill?.status === "cancelled" && <div className="msg cancelled" data-testid="steer-remember-cancelled">Cancelled</div>}
  </>;
}

/** A remembered steer with the user's reaction: confirm it, or forget it and optionally edit it instead. */
export function MemoryNoticeItem({ artifact, artifacts, sessionId, repoDir, worktree }: ConversationItemProps) {
  const notice = artifact.data as MemoryNoticeData;
  const reaction = (artifacts.findLast((a) => a.type === "MemoryReaction" && (a.data as MemoryReactionData).notice === artifact.id)?.data as MemoryReactionData | undefined)?.reaction ?? null;
  const { error, run } = useAction();
  const react = (value: "up" | "down") => void run(() => memoriesClient.react(sessionId, artifact.id, value));
  const editInstead = () => void run(async () => {
    await memoriesClient.put(repoDir, notice.scope, notice.key, notice.memory);
    navigation.navigate(`${routeUrl({ kind: "repo", path: worktree })}&memory=${encodeURIComponent(`${notice.scope}/${notice.key}`)}`);
  });
  return <div className="msg memory-notice" data-testid="memory-notice">
    <p>Remembered for {notice.scope === "session" ? "this session" : notice.scope === "repo" ? "this repo" : "everywhere"}: when <em>{notice.memory.situation}</em>, <em>{notice.memory.wanted}</em></p>
    {reaction === null && <div className="memory-reactions">
      <IconButton label="Remember this" onClick={() => react("up")}>👍</IconButton>
      <IconButton label="Forget this" onClick={() => react("down")}>👎</IconButton>
    </div>}
    {reaction === "up" && <p className="memory-state">Confirmed</p>}
    {reaction === "down" && <p className="memory-state">Forgotten <button type="button" onClick={editInstead}>Edit instead</button></p>}
    <ErrorText error={error} />
  </div>;
}
