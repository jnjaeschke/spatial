import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Artifact, DiffFile, Hunk, Id, PhabCommentData } from "../../../web/plugin-api.ts";
import { AnswerMarkdown } from "../../../web/plugin-api.ts";
import { CollapseContext } from "../../../web/plugin-api.ts";
import { phabCommentCollapseId } from "../../../web/plugin-api.ts";
import { phabPreview } from "./phab-preview.ts";

/** Rendered body that is clamped to a few lines, with a toggle, when it does not fit. */
function ClampedBody({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !expanded) setOverflows(el.scrollHeight > el.clientHeight + 1);
  });
  return <>
    <div ref={ref} className={`phab-body${expanded ? "" : " clamped"}${overflows && !expanded ? " fading" : ""}`}>{children}</div>
    {(overflows || expanded) && <button className="phab-more nodrag" onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Show more"}</button>}
  </>;
}

/** A Phabricator comment: Markdown body, bot comments collapsed to a one-line preview. `anchorId` is the comment's first artifact id. */
export function PhabComment({ comment, anchorId, where, hunks = [], diffId = "" }: { comment: Artifact<PhabCommentData>; anchorId: Id; where?: string; hunks?: { file: DiffFile; hunk: Hunk }[]; diffId?: string }) {
  const collapse = useContext(CollapseContext);
  const id = phabCommentCollapseId(anchorId);
  const { author, bot, done, body } = comment.data;
  const closed = bot && (collapse?.collapsed.has(id) ?? false);
  const markdown = <AnswerMarkdown text={body} hunks={hunks} diffId={diffId} />;
  return <div className="phab-comment" data-testid="phab-comment" data-bot={bot}>
    <div className="phab-comment-head">
      {where && <span className="phab-where">{where} ·</span>}
      <strong>@{author}</strong>
      {bot && <span className="badge phab-bot">bot</span>}
      {done && <span className="badge phab-done">Done</span>}
      {bot && collapse && <button aria-label={closed ? "Expand comment" : "Collapse comment"} className="collapse nodrag" onClick={() => collapse.toggle(id)}>{closed ? "▸" : "▾"}</button>}
    </div>
    {closed ? <div className="phab-preview">{phabPreview(body)}</div>
      : bot ? <div className="phab-body">{markdown}</div> : <ClampedBody>{markdown}</ClampedBody>}
  </div>;
}
