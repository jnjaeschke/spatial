import type { PhabCommentData } from "../../review/api.ts";
import type { CommentPlanItem } from "../shared/comment-plan.ts";

/** The heading and quoted line that introduce a comment; `withPhid` puts its phid before the author. */
export function commentIntro(c: PhabCommentData, withPhid = false): string[] {
  return [
    `## ${withPhid ? `${c.phid} by ` : ""}${c.author} on D${c.revision}${c.path !== undefined && c.line !== undefined ? `, ${c.path}:${c.line}` : " (general comment)"}`,
    ...(c.quote !== undefined ? [`Commented line: \`${c.quote}\``] : []),
  ];
}

/** The implement revision text for the comments marked `address`; null when there are none. */
export function commentsFeedback(items: CommentPlanItem[]): string | null {
  const address = items.filter((item) => item.action === "address");
  if (!address.length) return null;
  return ["Address these reviewer comments from Phabricator. Keep each commit's `Differential Revision:` line.", ...address.map(({ comment, interpretation, text }) => {
    const c = comment.data;
    return [
      ...commentIntro(c),
      c.body,
      ...(interpretation ? [`What they ask: ${interpretation.data.asks}`, `Proposed change: ${interpretation.data.proposal}`] : []),
      ...(text ? [`Author's note: ${text}`] : []),
    ].join("\n");
  })].join("\n\n");
}
