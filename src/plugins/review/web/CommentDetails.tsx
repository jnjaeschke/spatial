import { type Graph, type ChatActions, SidePanel, ChatActionsContext, draftTexts } from "../../../web/plugin-api.ts";
import { isReviewKind } from "./graph.ts";
import { UserCommentBox } from "./UserCommentBox.tsx";

type Found = { item: Parameters<typeof UserCommentBox>[0]["item"]; diffId: string };

/** Finds the user comment (draft or saved) of a comment detail. */
export function findComment(graph: Graph | null, id: string): Found | null {
  for (const node of graph?.nodes ?? []) if (isReviewKind(node.data, "change")) {
    const item = node.data.comments.find((candidate) => (candidate.artifact?.id ?? candidate.draft?.id) === id);
    if (item) return { item, diffId: node.data.diffId };
  }
  return null;
}

/** Closing the panel discards an unsaved draft. */
export function CommentDetails({ comment, actions, onClose, onBack }: { comment: Found; actions: ChatActions | null; onClose(): void; onBack?(): void }) {
  const close = () => {
    const { draft } = comment.item;
    if (draft) { draftTexts.delete(draft.id); actions?.onDiscard(draft.id); }
    onClose();
  };
  return <ChatActionsContext.Provider value={actions}>
    <SidePanel className="review-detail-panel" title="Comment" closeLabel="Close comment panel" testId="comment-panel" onClose={close}
      onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); close(); } }}
      headerExtra={onBack && <button aria-label="Back" onClick={onBack}>←</button>}>
      <UserCommentBox item={comment.item} diffId={comment.diffId} />
    </SidePanel>
  </ChatActionsContext.Provider>;
}
