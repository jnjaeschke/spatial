import { readFileSync } from "node:fs";
import { defineTask, latestArtifact, prependRepoContext, type Artifact, type Id } from "../../../../plugin-api.ts";
import type { PhabCommentData } from "../../../review/api.ts";
import type { CommentInterpretationData, InvestigationData, ReviewerCommentsInput } from "../../shared/types.ts";
import { memorySections } from "../../runtime/memories.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as object;
type Reply = { comments: { phid: string; asks: string; proposal: string; action: "address" | "reply" | "ignore"; reply: string | null }[] };
const isReply = (v: unknown): v is Reply => Array.isArray((v as Reply | null)?.comments) && (v as Reply).comments.every((c) => typeof c.phid === "string" && typeof c.asks === "string" && typeof c.proposal === "string" && ["address", "reply", "ignore"].includes(c.action) && (c.reply === null || typeof c.reply === "string"));

const describe = (c: PhabCommentData, byPhid: Map<string, PhabCommentData>) => [
  `## ${c.phid} by ${c.author} on D${c.revision}${c.path !== undefined && c.line !== undefined ? `, ${c.path}:${c.line}` : " (general comment)"}`,
  ...(c.quote !== undefined ? [`Commented line: \`${c.quote}\``] : []),
  ...(c.replyTo && byPhid.get(c.replyTo) ? [`In reply to ${byPhid.get(c.replyTo)!.author}: ${byPhid.get(c.replyTo)!.body}`] : []),
  c.body,
].join("\n");

/** Private interpretation of reviewer comments: what each asks, a proposed change, a suggested action and reply. */
export const interpretComments = defineTask<ReviewerCommentsInput, { interpretationIds: Id[] }>({
  kind: "interpretComments",
  async run(ctx, { comments, llm }) {
    const all = ctx.artifacts.view().artifacts.filter((a) => a.type === "PhabComment") as Artifact<PhabCommentData>[];
    const latest = new Map<string, Artifact<PhabCommentData>>();
    for (const a of all) latest.set(a.data.phid, a);
    const byPhid = new Map([...latest].map(([phid, a]) => [phid, a.data]));
    const targets = comments.map((phid) => { const a = latest.get(phid); if (!a) throw new Error(`Unknown comment ${phid}`); return a; });
    const kind = latestArtifact<InvestigationData>(ctx.artifacts.view().artifacts, "Investigation")?.data.kind ?? null;
    const prompt = [...memorySections(ctx, "reviewerComments", kind), "# Reviewer comments", ...targets.map((a) => describe(a.data, byPhid))].join("\n\n");
    const r = await ctx.llm.run({ prompt, system: prependRepoContext(SYSTEM, ctx), schema: SCHEMA, cwd: ctx.repo, tools: "read-only", mcpServers: { ...ctx.sessionMcp, ...ctx.repoMcp } }, llm);
    const json = r.json;
    if (!isReply(json)) throw new Error(`Comment interpretation reply is not valid: ${JSON.stringify(json)}`);
    for (const c of json.comments) if (!latest.has(c.phid) || !comments.includes(c.phid)) throw new Error(`The interpretation names unknown comment ${c.phid}`);
    const resolved = targets.map((a) => {
      const c = json.comments.find((item) => item.phid === a.data.phid);
      if (!c) throw new Error(`The model did not interpret ${a.data.phid}`);
      return { target: a, reply: c };
    });
    const ids = resolved.map(({ target, reply }) => {
      const interpretation = ctx.artifacts.put<CommentInterpretationData>("CommentInterpretation", "proposed", { comment: target.id, phid: target.data.phid, asks: reply.asks, proposal: reply.proposal, action: reply.action, reply: reply.reply }, r.selection);
      ctx.links.put(interpretation.id, target.id, "about");
      return interpretation.id;
    });
    return { interpretationIds: ids };
  },
});
