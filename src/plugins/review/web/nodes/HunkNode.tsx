import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { HunkNodeData } from "../graph.ts";
import { Box, DiffView, commitColors, type Row } from "../../../../web/plugin-api.ts";
import { UserCommentBox } from "../UserCommentBox.tsx";
import { SpecStepContext } from "../SpecPanel.tsx";
import { Chip, FindingChip } from "../Chip.tsx";
import { DetailsContext } from "../details.ts";

export type HunkFlowNode = Node<HunkNodeData & { sessionId: string } & Record<string, unknown>, "hunk">;

/** One hunk of a change with the chats and comments anchored in it. */
export function HunkNode({ data }: NodeProps<HunkFlowNode>) {
  const { file, hunk, diffId, sessionId, commit } = data;
  const selection = useContext(SpecStepContext);
  const details = useContext(DetailsContext);
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
          afterRow={(row) => <>{data.threads.filter((thread) => thread.lines?.path === file.path && thread.lines.end === (thread.lines.side === "new" ? row.new : row.old)).map((thread) => <tr className="thread-row chip-row" key={thread.threadId ?? thread.draftId}><td colSpan={4}><Chip kind="chat" label={thread.messages.at(-1)?.data.text ?? "New chat"} count={thread.messages.length} selected={details?.current?.kind === "chat" && details.current.id === (thread.threadId ?? thread.draftId)} testId={`chat-chip-${thread.threadId ?? thread.draftId}`} onOpen={() => details?.open({ kind: "chat", id: thread.threadId ?? thread.draftId! })} /></td></tr>)}{data.comments.filter((comment) => comment.lines.path === file.path && comment.lines.end === (comment.lines.side === "new" ? row.new : row.old)).map((item) => { const id = item.artifact?.id ?? item.draft!.id; return <tr className="thread-row chip-row" key={id}><td colSpan={4}><Chip kind="comment" label={(item.artifact?.data.body ?? "New comment").split("\n")[0]!} selected={details?.current?.kind === "comment" && details.current.id === id} testId={`comment-chip-${id}`} onOpen={() => details?.open({ kind: "comment", id })} /></td></tr>; })}{data.findings.filter((finding) => finding.lines?.path === file.path && finding.lines.end === (finding.lines.side === "new" ? row.new : row.old)).map((finding) => <tr className="thread-row chip-row" key={finding.findingId}><td colSpan={4}><FindingChip finding={finding} /></td></tr>)}</>} />
      </div>
    </Box>
  );
}
