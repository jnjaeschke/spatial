import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { SummaryNodeData } from "../graph.ts";
import { Box, InlineText, ChatActionsContext, ReopenClosed, AnswerMarkdown } from "../../../../web/plugin-api.ts";
import { commitColors, commitLabel } from "../../../../web/plugin-api.ts";
import { ReviewPanel } from "../ReviewPanel.tsx";
import { ChatItem, FindingItem, PhabItem } from "../InlineItem.tsx";

export type SummaryFlowNode = Node<SummaryNodeData & Record<string, unknown>, "summary">;

export function SummaryNode({ data }: NodeProps<SummaryFlowNode>) {
  const actions = useContext(ChatActionsContext);
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
        {(data.phabGeneralThreads.length > 0 || data.phabUnanchoredThreads.length > 0) && <section className="phab-summary"><h4>Phabricator comments</h4><div className="inline-strip">{data.phabGeneralThreads.map((thread) => <PhabItem key={thread.anchorId} thread={thread} />)}{data.phabUnanchoredThreads.map((thread) => <PhabItem key={thread.anchorId} thread={thread} />)}</div></section>}
        {actions && data.reviews.map((review) => <ReviewPanel key={review.revision} sessionId={data.sessionId} review={review} />)}
        <div className="inline-strip">{data.findings.map((finding) => <FindingItem key={finding.findingId} finding={finding} />)}</div>
        <div className="inline-strip">{(data.threads ?? []).map((thread) => <ChatItem key={thread.threadId ?? thread.draftId} thread={thread} />)}</div>
        <ul className="files">
          {data.commits.map((c, i) => <li key={c.sha}>{data.commits.length > 1 && <><span className="swatch" style={{ background: commitColors(i).swatch }} />{commitLabel(i, c)}</>}{data.commits.length === 1 && c.subject}</li>)}
        </ul>
        <ReopenClosed hostId={data.narrativeId} />
      </div>
    </Box>
  );
}
