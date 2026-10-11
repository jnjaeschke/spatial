import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { HunkNodeData } from "../graph.ts";
import { Box, DiffView, ReopenClosed, commitColors, type Row } from "../../../../web/plugin-api.ts";
import { UserCommentBox } from "../UserCommentBox.tsx";
import { SpecStepContext } from "../SpecPanel.tsx";
import { commentId } from "../CommentDetails.tsx";
import { ChatItem, FindingItem, PhabItem, UserCommentItem } from "../InlineItem.tsx";
import { DetailsContext } from "../details.ts";
import { symbolMarks } from "../symbols.ts";
import { SymbolMarkContext } from "../SymbolCard.tsx";

export type HunkFlowNode = Node<HunkNodeData & { sessionId: string } & Record<string, unknown>, "hunk">;

/** One hunk of a change with the chats and comments anchored in it. */
export function HunkNode({ id, data }: NodeProps<HunkFlowNode>) {
  const { file, hunk, diffId, sessionId, commit } = data;
  const selection = useContext(SpecStepContext);
  const details = useContext(DetailsContext);
  const symbolMark = useContext(SymbolMarkContext);
  const rowClass = selection ? (row: Row) => {
    const mapped = selection.ranges.some((range) => {
      const line = range.side === "old" ? row.old : row.new;
      return range.path === file.path && line !== undefined && range.start <= line && line <= range.end;
    });
    return mapped ? `step-mapped${selection.kind ? ` map-${selection.kind}` : ""}` : undefined;
  } : undefined;
  return (
    <Box kind="hunk" testId={`hunk-card-${hunk.id}`} style={commit !== null ? { borderLeft: `4px solid ${commitColors(commit).swatch}` } : undefined} title={<>{commit !== null && <span className="commit-tag">C{commit + 1}</span>}{file.path}</>}>
      <div className="body nodrag nopan">
        <DiffView sessionId={sessionId} diffId={diffId} file={file} hunk={hunk} rowClass={rowClass}
          marks={data.symbols ? (row) => symbolMarks(row.text, row.commit ?? commit ?? 0, data.symbols!) : undefined}
          onMark={(mark, rect) => { symbolMark?.click(mark, rect); if (!symbolMark) details?.open({ kind: "symbol", name: mark.name, site: 0 }); }}
          onMarkHover={symbolMark?.hover}
          afterRow={(row) => <>{data.threads.filter((thread) => thread.lines?.path === file.path && thread.lines.end === (thread.lines.side === "new" ? row.new : row.old)).map((thread) => <tr className="thread-row inline-row" key={thread.threadId ?? thread.draftId}><td colSpan={4}><ChatItem thread={thread} /></td></tr>)}{data.phabThreads.filter((thread) => thread.path === file.path && thread.line === (thread.side === "new" ? row.new : row.old)).map((thread) => <tr className="thread-row inline-row" key={thread.anchorId}><td colSpan={4}><PhabItem thread={thread} /></td></tr>)}{data.comments.filter((comment) => comment.lines.path === file.path && comment.lines.end === (comment.lines.side === "new" ? row.new : row.old)).map((item) => <tr className="thread-row inline-row" key={commentId(item)}><td colSpan={4}><UserCommentItem item={item} diffId={diffId} /></td></tr>)}{data.findings.filter((finding) => finding.lines?.path === file.path && finding.lines.end === (finding.lines.side === "new" ? row.new : row.old)).map((finding) => <tr className="thread-row inline-row" key={finding.findingId}><td colSpan={4}><FindingItem finding={finding} /></td></tr>)}</>} />
        <ReopenClosed hostId={id} />
      </div>
    </Box>
  );
}
