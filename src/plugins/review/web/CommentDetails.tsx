import { type Graph, type ChatActions, SidePanel, ChatActionsContext, draftTexts } from "../../../web/plugin-api.ts";
import { isReviewKind } from "./graph.ts";
import { UserCommentBox } from "./UserCommentBox.tsx";

type Found = { item: Parameters<typeof UserCommentBox>[0]["item"]; diffId: string };

/** The id of a comment that survives edits: its first version, or the draft. */
export const commentId = (item: Found["item"]) => item.artifact ? item.artifact.data.replaces ?? item.artifact.id : item.draft!.id;

/** Finds the user comment (draft or saved) of a comment detail. */
export function findComment(graph: Graph | null, id: string): Found | null {
  for (const node of graph?.nodes ?? []) if (isReviewKind(node.data, "change")) {
    const item = node.data.comments.find((candidate) => commentId(candidate) === id);
    if (item) return { item, diffId: node.data.diffId };
  }
  return null;
}

/** Closing the panel or pressing Escape discards an unsaved draft. */
export function CommentDetails({ comment, actions, onClose, onBack }: { comment: Found; actions: ChatActions | null; onClose(): void; onBack?(): void }) {
  const close = () => {
    const { draft } = comment.item;
    if (draft) { draftTexts.delete(draft.id); actions?.onDiscard(draft.id); }
    onClose();
  };
  return <ChatActionsContext.Provider value={actions}>
    <SidePanel className="review-detail-panel" title="Comment" closeLabel="Close comment panel" testId="comment-panel" onClose={close} onBack={onBack}>
      <UserCommentBox item={comment.item} diffId={comment.diffId} />
    </SidePanel>
  </ChatActionsContext.Provider>;
}
