import { useContext, useState, type SyntheticEvent } from "react";
import type { ChangeNodeData } from "./graph.ts";
import { api, ChatActionsContext, draftTexts, Box, Composer, useDraftText } from "../../../web/plugin-api.ts";

type CommentItem = ChangeNodeData["comments"][number];

export function UserCommentBox({ item, diffId }: { item: CommentItem; diffId: string }) {
  const actions = useContext(ChatActionsContext);
  const [body, setBody, clearDraft] = useDraftText(item.draft?.id, item.artifact?.data.body ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = `Comment${item.revision ? ` for D${item.revision}` : ""}`;
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  const saveDraft = async () => {
    if (!actions || !item.draft || !body.trim() || busy) return;
    setBusy(true);
    try {
      await api.createComment(actions.sessionId, diffId, item.lines, body.trim());
      clearDraft();
      actions.onDiscard(item.draft.id);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const saveEdit = async () => {
    if (!actions || !item.artifact || busy) return;
    setBusy(true);
    try { await api.editComment(actions.sessionId, item.artifact.data.replaces ?? item.artifact.id, body.trim()); setEditing(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!actions || !item.artifact || busy) return;
    setBusy(true);
    try { await api.deleteComment(actions.sessionId, item.artifact.data.replaces ?? item.artifact.id); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Box nested kind="user-comment" className="nodrag nopan nowheel" testId="user-comment" title={title} closeLabel="Discard" onMouseDown={stop} onClick={stop} onClose={item.draft ? () => { draftTexts.delete(item.draft!.id); actions?.onDiscard(item.draft!.id); } : undefined}>
    {item.draft ? <>
      <Composer label="Comment for Phabricator" value={body} onChange={setBody} canSubmit={!!body.trim() && !busy} onSubmit={() => void saveDraft()} onKeyDown={(event) => { if (event.key === "Escape" && body.trim()) event.preventDefault(); }} />
      <div><button disabled={!body.trim() || busy} onClick={() => void saveDraft()}>Save</button></div>
    </> : item.artifact && <>
      <div className="user-comment-author">You</div>
      {editing ? <><Composer label="Edit comment" value={body} onChange={setBody} canSubmit={!!body.trim() && !busy} onSubmit={() => void saveEdit()} onKeyDown={(event) => { if (event.key === "Escape") event.preventDefault(); }} /><div><button disabled={!body.trim() || busy} onClick={() => void saveEdit()}>Save</button><button onClick={() => { setBody(item.artifact!.data.body); setEditing(false); }}>Cancel</button></div></>
        : <><div className="user-comment-body">{item.artifact.data.body}</div>{item.postedTo !== null ? <div className="user-comment-status">Posted to D{item.postedTo}</div> : <div><button onClick={() => { setBody(item.artifact!.data.body); setEditing(true); }}>Edit</button><button disabled={busy} onClick={() => void remove()}>Delete</button></div>}</>}
    </>}
    {error && <div className="failed">{error}</div>}
  </Box>;
}
