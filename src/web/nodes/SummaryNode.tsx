import { useContext, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { SummaryNodeData, ZoomLevel } from "../graph.ts";
import { InlineText } from "../InlineText.tsx";
import { CollapseContext } from "../collapse.ts";
import { api } from "../api.ts";
import { PhabComment } from "../PhabComment.tsx";
import { ReopenChats } from "../ReopenChats.tsx";
import { commitColors, commitLabel } from "../commit-colors.ts";

export type SummaryFlowNode = Node<SummaryNodeData & { level: ZoomLevel } & Record<string, unknown>, "summary">;

export function SummaryNode({ data }: NodeProps<SummaryFlowNode>) {
  const [postResult, setPostResult] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const collapse = useContext(CollapseContext);
  const closed = collapse?.collapsed.has(data.narrativeId) ?? false;
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
  const totalDrafts = data.drafts.reduce((sum, draft) => sum + draft.count, 0);
  const postLabel = data.drafts.length === 1
    ? `Post ${totalDrafts} draft${totalDrafts !== 1 ? "s" : ""} to D${data.drafts[0]!.revision}`
    : `Post ${totalDrafts} drafts to ${data.drafts.map((draft) => `D${draft.revision} (${draft.count})`).join(", ")}`;
  return (
    <div className={`node summary-node level-${data.level}`} data-anchor={data.narrativeId} data-testid="summary">
      <div className="title">{data.changeCount} changes{collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(data.narrativeId)}>{closed ? "▸" : "▾"}</button>}</div>
      {data.sinceEpoch !== null && <div className="since-epoch" data-testid="since-epoch">Changes since epoch {data.sinceEpoch}</div>}
      {!closed && <div className="body nodrag nopan">
        <p><InlineText text={data.summary} /></p>
        {data.level !== "patch" && specText && <p className="spec-status">{specText}</p>}
        {data.level !== "patch" && data.phabGeneral.length > 0 && <section className="phab-summary">
          <h4>Phabricator comments</h4>
          <ul className="phab-comments">{data.phabGeneral.map((comment) => <li key={comment.id}><PhabComment comment={comment} anchorId={data.phabAnchors[comment.data.phid]!} /></li>)}</ul>
        </section>}
        {data.level !== "patch" && data.phabUnanchored.map((group, index) => {
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
        {data.level !== "patch" && (data.drafts.length > 0 || data.skipped > 0) && <div className="post-drafts-row">
          {data.drafts.length > 0 && <>
          <button className="post-drafts nodrag" onClick={async () => {
            setPostError(null);
            setPostResult(null);
            try {
              const result = await api.postDrafts(data.sessionId);
              const skipped = result.skipped.map((item) => `${item.finding}: ${item.reason}`).join("; ");
              setPostResult(`Posted ${result.posted} draft${result.posted !== 1 ? "s" : ""} to ${result.revision}${skipped ? `; skipped ${skipped}` : ""}`);
            } catch (e) { setPostError((e as Error).message); }
          }}>{postLabel}</button>
          </>}
          {data.skipped > 0 && <span className="post-skipped">{data.skipped} skipped</span>}
          {postResult && <span className="post-result">{postResult}</span>}
          {postError && <span className="post-error">{postError}</span>}
        </div>}
        {data.level !== "patch" && (
          <ul className="files">
            {data.commits.map((c, i) => <li key={c.sha}>{data.commits.length > 1 && <><span className="swatch" style={{ background: commitColors(i).swatch }} />{commitLabel(i, c)}</>}{data.commits.length === 1 && c.subject}</li>)}
          </ul>
        )}
        <ReopenChats hostId={data.narrativeId} />
      </div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
