import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { SummaryNodeData } from "../graph.ts";
import { Box, InlineText, CollapseContext, ChatActionsContext, ReopenClosed, AnswerMarkdown } from "../../../../web/plugin-api.ts";
import { PhabComment } from "../PhabComment.tsx";
import { commitColors, commitLabel } from "../../../../web/plugin-api.ts";
import { ReviewPanel } from "../ReviewPanel.tsx";
import { Chip, FindingChip } from "../Chip.tsx";
import { DetailsContext } from "../details.ts";

export type SummaryFlowNode = Node<SummaryNodeData & Record<string, unknown>, "summary">;

export function SummaryNode({ data }: NodeProps<SummaryFlowNode>) {
  const collapse = useContext(CollapseContext);
  const actions = useContext(ChatActionsContext);
  const details = useContext(DetailsContext);
  const specStatus = data.specStatus;
  const specText = specStatus && (
    specStatus.code + specStatus.inferred + specStatus.unverified === 0
      ? "No spec references in or near this patch"
      : `Specs: ${[
        specStatus.code > 0 && `${specStatus.code} cited in code`,
        specStatus.inferred > 0 && `${specStatus.inferred} inferred`,
        specStatus.unverified > 0 && `${specStatus.unverified} unverified`,
      ].filter(Boolean).join(", ")}`
  );
  const sinceEpoch = data.sinceEpoch !== null && <div className="since-epoch" data-testid="since-epoch">Changes since epoch {data.sinceEpoch}</div>;
  return (
    <Box kind="summary" testId="summary" data={{ "data-anchor": data.narrativeId }} handles={{ source: Position.Bottom }} title={`${data.changeCount} changes`} collapse={{ key: data.narrativeId }} stub={sinceEpoch}>
      {sinceEpoch}
      <div className="body nodrag nopan">
        <p><InlineText text={data.summary} /></p>
        {specText && <p className="spec-status">{specText}</p>}
        {data.bugs.map(({ report, summary, summarizing }) => <details className="bug-summary" data-testid="bug-summary" key={report.id}>
          <summary><a href={`https://bugzilla.mozilla.org/show_bug.cgi?id=${report.data.bug}`} target="_blank" rel="noreferrer">Bug {report.data.bug}</a>{report.data.title && ` — ${report.data.title}`}{report.data.status && ` · ${report.data.status}`}{report.data.component && ` · ${report.data.component}`}</summary>
          {report.data.error ? <p className="bug-error">{report.data.error}</p> : summary
            ? <AnswerMarkdown text={summary.data.summary} hunks={data.bugHunks} diffId={data.bugDiffId} />
            : summarizing ? <p>Summarizing…</p> : <p>Summary unavailable.</p>}
        </details>)}
        {data.phabGeneral.length > 0 && <section className="phab-summary">
          <h4>Phabricator comments</h4>
          <ul className="phab-comments">{data.phabGeneral.map((comment) => <li key={comment.id}><PhabComment comment={comment} anchorId={data.phabAnchors[comment.data.phid]!} /></li>)}</ul>
        </section>}
        {data.phabUnanchored.map((group, index) => {
          const id = group.outdatedEpoch === null ? null : `phab-outdated:${group.outdatedEpoch}`;
          const closedGroup = id !== null && (collapse?.collapsed.has(id) ?? false);
          const revision = group.comments[0]?.data.revision;
          const title = group.outdatedEpoch !== null ? `Phabricator comments (outdated, epoch ${group.outdatedEpoch})`
            : group.oldSide ? `Phabricator comments (D${revision}, diff ${group.diffId}, old side)`
              : `Phabricator comments (D${revision}${group.diffId === null ? ", not matching local" : `, diff ${group.diffId}, not matching local`})`;
          return <section className="phab-summary" key={`${group.diffId}:${group.oldSide}:${group.outdatedEpoch}:${index}`}>
            <h4>{title}{id !== null && collapse && <button aria-label={closedGroup ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(id)}>{closedGroup ? "▸" : "▾"}</button>}</h4>
            {!closedGroup && <ul className="phab-comments">{group.comments.map((comment) => <li key={comment.id}><PhabComment comment={comment} anchorId={data.phabAnchors[comment.data.phid]!} where={`${comment.data.path}:${comment.data.line}`} /></li>)}</ul>}
          </section>;
        })}
        {actions && data.reviews.map((review) => <ReviewPanel key={review.revision} sessionId={data.sessionId} review={review} />)}
        <div className="chip-strip">{data.findings.map((finding) => <FindingChip key={finding.findingId} finding={finding} />)}</div>
        <div className="chip-strip">{(data.threads ?? []).map((thread) => <Chip key={thread.threadId ?? thread.draftId} kind="chat" label={thread.messages.at(-1)?.data.text ?? "New chat"} count={thread.messages.length} selected={details?.current?.kind === "chat" && details.current.id === (thread.threadId ?? thread.draftId)} testId={`chat-chip-${thread.threadId ?? thread.draftId}`} onOpen={() => details?.open({ kind: "chat", id: thread.threadId ?? thread.draftId! })} />)}</div>
        <ul className="files">
          {data.commits.map((c, i) => <li key={c.sha}>{data.commits.length > 1 && <><span className="swatch" style={{ background: commitColors(i).swatch }} />{commitLabel(i, c)}</>}{data.commits.length === 1 && c.subject}</li>)}
        </ul>
        <ReopenClosed hostId={data.narrativeId} />
      </div>
    </Box>
  );
}
