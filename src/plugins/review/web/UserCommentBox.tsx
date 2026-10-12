import { useContext, useState, type SyntheticEvent } from "react";
import type { ChangeNodeData } from "./graph.ts";
import { IconButton, api, ChatActionsContext, Composer, useDraftText, useAction, ErrorText } from "../../../web/plugin-api.ts";
import { InlineStatesContext } from "../../../web/plugin-api.ts";

type CommentItem = ChangeNodeData["comments"][number];

export function UserCommentBox({ item, diffId }: { item: CommentItem; diffId: string }) {
  const actions = useContext(ChatActionsContext);
  const inline = useContext(InlineStatesContext);
  const [body, setBody, clearDraft] = useDraftText(item.draft?.id, item.artifact?.data.body ?? "");
  const [editing, setEditing] = useState(false);
  const { busy, error, run } = useAction();
  const title = `Comment${item.revision ? ` for D${item.revision}` : ""}`;
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  const saveDraft = async () => {
    if (!actions || !item.draft || !body.trim() || busy) return;
    void run(async () => {
      const { artifactId } = await api.createComment(actions.sessionId, diffId, item.lines, body.trim());
      clearDraft();
      actions.onDiscard(item.draft!.id);
      inline?.move(item.draft!.id, artifactId);
    });
  };
  const saveEdit = async () => {
    if (!actions || !item.artifact || busy) return;
    void run(async () => { await api.editComment(actions.sessionId, item.artifact!.data.replaces ?? item.artifact!.id, body.trim()); setEditing(false); });
  };
  const remove = async () => {
    if (!actions || !item.artifact || busy) return;
    void run(() => api.deleteComment(actions.sessionId, item.artifact!.data.replaces ?? item.artifact!.id));
  };
  return <div className="user-comment-node nodrag nopan nowheel" data-testid="user-comment" aria-label={title} onMouseDown={stop} onClick={stop}>
    {item.draft && <IconButton label="Discard comment" className="link-button user-comment-discard" onClick={() => { clearDraft(); actions?.onDiscard(item.draft!.id); }}>×</IconButton>}
    {item.draft ? <>
      <Composer label="Comment for Phabricator" value={body} onChange={setBody} canSubmit={!!body.trim() && !busy} onSubmit={() => void saveDraft()} onKeyDown={(event) => { if (event.key === "Escape" && body.trim()) event.preventDefault(); }} />
      <div><button disabled={!body.trim() || busy} onClick={() => void saveDraft()}>Save</button></div>
    </> : item.artifact && <>
      <div className="user-comment-author">You</div>
      {editing ? <><Composer label="Edit comment" value={body} onChange={setBody} canSubmit={!!body.trim() && !busy} onSubmit={() => void saveEdit()} onKeyDown={(event) => { if (event.key === "Escape") event.preventDefault(); }} /><div><button disabled={!body.trim() || busy} onClick={() => void saveEdit()}>Save</button><button onClick={() => { setBody(item.artifact!.data.body); setEditing(false); }}>Cancel</button></div></>
        : <><div className="user-comment-body">{item.artifact.data.body}</div>{item.postedTo !== null ? <div className="user-comment-status">Posted to D{item.postedTo}</div> : <div><button onClick={() => { setBody(item.artifact!.data.body); setEditing(true); }}>Edit</button><button disabled={busy} onClick={() => void remove()}>Delete</button></div>}</>}
    </>}
    <ErrorText error={error} />
  </div>;
}
