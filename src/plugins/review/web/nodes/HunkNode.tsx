import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { HunkNodeData } from "../graph.ts";
import { Box, DiffView, commitColors } from "../../../../web/plugin-api.ts";
import { UserCommentBox } from "../UserCommentBox.tsx";
import { HostedThreadBox } from "./HostedThreadBox.tsx";

export type HunkFlowNode = Node<HunkNodeData & { sessionId: string } & Record<string, unknown>, "hunk">;

/** One hunk of a change with the chats and comments anchored in it. */
export function HunkNode({ data }: NodeProps<HunkFlowNode>) {
  const { file, hunk, diffId, sessionId, commit } = data;
  return (
    <Box kind="hunk" testId={`hunk-card-${hunk.id}`} style={commit !== null ? { borderLeft: `4px solid ${commitColors(commit).swatch}` } : undefined} title={<>{commit !== null && <span className="commit-tag">C{commit + 1}</span>}{file.path}</>}>
      <div className="body nodrag nopan">
        <DiffView sessionId={sessionId} diffId={diffId} file={file} hunk={hunk} threads={data.threads} renderThread={(thread) => <HostedThreadBox thread={thread} />}
          afterRow={(row) => data.comments.filter((comment) => comment.lines.path === file.path && comment.lines.end === (comment.lines.side === "new" ? row.new : row.old)).map((item) => <tr className="thread-row user-comment-row" key={item.artifact?.id ?? item.draft?.id}><td colSpan={4}><UserCommentBox item={item} diffId={diffId} /></td></tr>)} />
      </div>
    </Box>
  );
}
