import { readFileSync } from "node:fs";
import { loadSchema, defineTask, latestArtifact, prependRepoContext, runStructured, type Id } from "../../../../plugin-api.ts";
import { latestByPhid, type PhabCommentData } from "../../../review/api.ts";
import type { CommentInterpretationData, InvestigationData, ReviewerCommentsInput } from "../../shared/types.ts";
import { memorySections } from "../../runtime/memories.ts";
import { commentIntro } from "../../runtime/comments-feedback.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = loadSchema(import.meta.url);
type Reply = { comments: { phid: string; asks: string; proposal: string; action: "address" | "reply" | "ignore"; reply: string | null }[] };

const describe = (c: PhabCommentData, byPhid: Map<string, PhabCommentData>) => [
  ...commentIntro(c, true),
  ...(c.replyTo && byPhid.get(c.replyTo) ? [`In reply to ${byPhid.get(c.replyTo)!.author}: ${byPhid.get(c.replyTo)!.body}`] : []),
  c.body,
].join("\n");

/** Private interpretation of reviewer comments: what each asks, a proposed change, a suggested action and reply. */
export const interpretComments = defineTask<ReviewerCommentsInput, { interpretationIds: Id[] }>({
  kind: "interpretComments",
  async run(ctx, { comments, llm }) {
    const latest = latestByPhid(ctx.artifacts.view().artifacts);
    const byPhid = new Map([...latest].map(([phid, a]) => [phid, a.data]));
    const targets = comments.map((phid) => { const a = latest.get(phid); if (!a) throw new Error(`Unknown comment ${phid}`); return a; });
    const kind = latestArtifact<InvestigationData>(ctx.artifacts.view().artifacts, "Investigation")?.data.kind ?? null;
    const prompt = [...memorySections(ctx, "reviewerComments", kind), "# Reviewer comments", ...targets.map((a) => describe(a.data, byPhid))].join("\n\n");
    const { json, result } = await runStructured<Reply>(ctx.llm, {
      prompt, system: prependRepoContext(SYSTEM, ctx), schema: SCHEMA, cwd: ctx.repo, tools: "read-only", mcpServers: ctx.mcpServers(), label: "Comment interpretation", repairs: 1,
      validate: (reply) => [
        ...(reply as Reply).comments.filter((c) => !comments.includes(c.phid)).map((c) => `The interpretation names unknown comment ${c.phid}`),
        ...comments.filter((phid) => !(reply as Reply).comments.some((c) => c.phid === phid)).map((phid) => `The model did not interpret ${phid}`),
      ],
    }, llm);
    const resolved = targets.map((a) => ({ target: a, reply: json.comments.find((item) => item.phid === a.data.phid)! }));
    const ids = resolved.map(({ target, reply }) => {
      const interpretation = ctx.artifacts.put<CommentInterpretationData>("CommentInterpretation", "proposed", { comment: target.id, phid: target.data.phid, asks: reply.asks, proposal: reply.proposal, action: reply.action, reply: reply.reply }, result.selection);
      ctx.links.put(interpretation.id, target.id, "about");
      return interpretation.id;
    });
    return { interpretationIds: ids };
  },
});
