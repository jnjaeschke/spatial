import { readFileSync } from "node:fs";
import type { Artifact, ChatMessageData, ChatThreadData, LlmSelection, McpServerData, RevisionData } from "../../shared/types.ts";
import { defineTask } from "../../runtime/tasks.ts";
import { buildAnchorContext, type SelectedText } from "./context.ts";
import { findSpan, revisedText, revisionsOf } from "../../shared/revisions.ts";
import { prependRepoContext } from "../../runtime/repo-context.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as object;
interface Reply { answer: string; questions: string[]; revisions: { message: string | null; quote: string; correction: string }[]; requestMcpServers: string[]; [field: string]: unknown }
const isReply = (j: unknown): j is Reply => {
  const r = j as Partial<Reply> | undefined;
  return typeof r?.answer === "string" && Array.isArray(r.questions) && r.questions.every((q) => typeof q === "string") && Array.isArray(r.revisions) &&
    r.revisions.every((v) => (v?.message === null || typeof v?.message === "string") && typeof v.quote === "string" && typeof v.correction === "string") &&
    Array.isArray(r.requestMcpServers) && r.requestMcpServers.every((name) => typeof name === "string");
};
const same = (a?: LlmSelection, b?: LlmSelection) => !!a && !!b && a.backend === b.backend && a.model === b.model && a.effort === b.effort;

export const chatTurn = defineTask<{ threadId?: string; anchor?: string; aside?: boolean; text: string; quote?: string; lines?: SelectedText["lines"]; llm: LlmSelection }, { threadId: string; messageId: string }>({
  kind: "chatTurn",
  async run(ctx, { threadId, anchor, aside, text, quote, lines, llm }) {
    if ((threadId === undefined) === (anchor === undefined)) throw new Error("chatTurn needs exactly one of threadId or anchor");
    if (aside && threadId) throw new Error("aside chatTurn needs an anchor");
    if (!text.trim()) throw new Error("Message is empty");
    const view = ctx.artifacts.view();
    let thread: Artifact<ChatThreadData>;
    if (threadId) {
      thread = ctx.artifacts.get<ChatThreadData>(threadId);
      if (thread.type !== "ChatThread") throw new Error(`Artifact ${threadId} is not a ChatThread`);
    } else {
      buildAnchorContext(view, anchor!, contextOptions());
      thread = ctx.artifacts.put<ChatThreadData>("ChatThread", "verified", { anchor: anchor!, ...(aside ? { aside: true } : {}), quote, lines });
      ctx.links.put(thread.id, anchor!, "about");
    }

    const history = ctx.artifacts.linkedTo(thread.id, "reply") as Artifact<ChatMessageData>[];
    const user = ctx.artifacts.put<ChatMessageData>("ChatMessage", "verified", { role: "user", text });
    ctx.links.put(user.id, thread.id, "reply");

    const lastAssistant = history.filter((m) => m.data.role === "assistant").at(-1);
    const resume = same(lastAssistant?.data.llm, llm) ? lastAssistant!.data.providerSessionId : undefined;
    const prompt = resume
      ? text
      : [
          buildAnchorContext(view, thread.data.anchor, contextOptions(), thread.data.quote === undefined ? undefined : { quote: thread.data.quote, lines: thread.data.lines }),
          ...(history.length ? ["# Conversation so far", "", ...history.map((m) => `${m.data.role === "user" ? "User" : "Assistant"}: ${revisedText(view, m)}`), ""] : []),
          "# Question", "", text,
        ].join("\n");

    const enabledNames = (ctx.artifacts.linkedTo(thread.id, "about") as Artifact<McpServerData>[])
      .filter((artifact) => artifact.type === "McpServerEnabled")
      .map((artifact) => artifact.data.server);
    const enabledRepoMcp = Object.fromEntries([...new Set(enabledNames)].filter((name) => ctx.repoRequestableMcp[name]).map((name) => [name, ctx.repoRequestableMcp[name]!]));
    const requestableNames = Object.keys(ctx.repoRequestableMcp);
    const systemBody = SYSTEM + ctx.chat.replyFields.map((field) => "\n\n" + field.prompt).join("");
    const system = prependRepoContext(systemBody, ctx) + (requestableNames.length
      ? `\n\n# Repo MCP servers available on request\nThe following server(s) are not active but can be enabled by the user: ${requestableNames.join(", ")}.\nInclude the server name in \`requestMcpServers\` in your reply to request access.`
      : "");
    const schema = structuredClone(SCHEMA) as { properties: Record<string, unknown>; required: string[] };
    for (const field of ctx.chat.replyFields) { schema.properties[field.name] = { anyOf: [field.schema, { type: "null" }] }; schema.required.push(field.name); }
    const r = await ctx.llm.run({ prompt, system, schema, cwd: ctx.repo, tools: "read-only", resumeProviderSession: resume, mcpServers: { ...ctx.sessionMcp, ...ctx.repoMcp, ...enabledRepoMcp } }, llm);
    const json = r.json as Reply | undefined;
    if (!isReply(json)) throw new Error(`Chat reply is not valid JSON: ${JSON.stringify(r.json)}`);

    const existingRequests = new Set((ctx.artifacts.linkedTo(thread.id, "about") as Artifact<McpServerData>[])
      .filter((artifact) => artifact.type === "McpServerRequest").map((artifact) => artifact.data.server));
    for (const name of new Set(json.requestMcpServers)) {
      if (!ctx.repoRequestableMcp[name]) continue;
      if (existingRequests.has(name)) continue;
      const request = ctx.artifacts.put<McpServerData>("McpServerRequest", "proposed", { server: name });
      ctx.links.put(request.id, thread.id, "about");
    }

    const newestFirst = history.filter((m) => m.data.role === "assistant").reverse();
    const accepted: { target: Artifact<ChatMessageData>; data: RevisionData }[] = [];
    const errors: string[] = [];
    for (const revision of json.revisions) {
      const result = resolveRevision(revision);
      if (typeof result === "string") errors.push(result); else accepted.push(result);
    }
    function resolveRevision(revision: Reply["revisions"][number]): { target: Artifact<ChatMessageData>; data: RevisionData } | string {
      const label = revision.quote.slice(0, 60);
      let candidates = newestFirst;
      if (revision.message !== null) {
        const message = view.artifacts.find((a) => a.id === revision.message);
        if (message?.type !== "ChatMessage" || (message.data as ChatMessageData).role !== "assistant") return `${revision.message}: not an assistant message`;
        candidates = [message as Artifact<ChatMessageData>];
      }
      const failures: string[] = [];
      for (const target of candidates) {
        const span = findSpan(target.data.text, revision.quote);
        if ("error" in span) { failures.push(span.error); continue; }
        const earlier = [...revisionsOf(view, target.id).map((a) => a.data), ...accepted.filter((a) => a.target.id === target.id).map((a) => a.data)];
        if (earlier.some((e) => { const old = findSpan(target.data.text, e.quote); return !("error" in old) && span.start < old.end && span.end > old.start; })) {
          return `${label}: overlaps an earlier revision`;
        }
        return { target, data: { quote: target.data.text.slice(span.start, span.end), correction: revision.correction } };
      }
      return `${label}: ${failures.find((f) => f !== "quote not found") ?? (revision.message === null ? "quote not found in this chat" : "quote not found")}`;
    }
    const replyErrors: { label: string; error: string }[] = [];
    const acceptedFields: { artifacts: { type: string; data: unknown }[] }[] = [];
    for (const field of ctx.chat.replyFields) {
      const value = json[field.name];
      if (value === null || value === undefined) continue;
      const accepted = await field.accept(ctx, value);
      if (!accepted.ok) replyErrors.push({ label: field.label, error: accepted.error });
      else acceptedFields.push({ artifacts: accepted.artifacts });
    }
    const reply = ctx.artifacts.put<ChatMessageData>(
      "ChatMessage", "proposed",
      { role: "assistant", text: json.answer, ...(json.questions.length ? { questions: json.questions } : {}), ...(errors.length ? { revisionErrors: errors } : {}), ...(replyErrors.length ? { replyErrors } : {}), llm: r.selection, providerSessionId: r.providerSessionId },
      r.selection,
    );
    ctx.links.put(reply.id, thread.id, "reply");
    for (const fieldResult of acceptedFields) {
      for (const item of fieldResult.artifacts) {
        const artifact = ctx.artifacts.put(item.type, "proposed", item.data, r.selection);
        ctx.links.put(artifact.id, reply.id, "derivedFrom");
      }
    }
    for (const { target, data } of accepted) {
      const revision = ctx.artifacts.put<RevisionData>("Revision", "proposed", data, r.selection);
      ctx.links.put(revision.id, target.id, "revises");
      ctx.links.put(revision.id, reply.id, "derivedFrom");
    }
    return { threadId: thread.id, messageId: reply.id };

    function contextOptions() { return { overview: [ctx.artifacts.overview()], context: ctx.chat.context(view), render: (ref: string) => ctx.artifacts.render(ref) }; }
  },
});
