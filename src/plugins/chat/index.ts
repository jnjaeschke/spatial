import { z } from "zod";
import { definePlugin, type Workflow } from "../../plugin-api.ts";
import type { Runtime } from "../../runtime/tasks.ts";
import type { Id } from "../../shared/types.ts";
import type { SessionView } from "../../runtime/render-ref.ts";

const params = z.strictObject({});
const chat: Workflow<z.infer<typeof params>> = {
  id: "chat", description: "Open conversation about the repository and its code. Use it for anything that is not clearly one of the other workflows.", argHint: "<message>", params,
  parseArgs: (args) => args.trim() ? { ok: true, params: {} } : { ok: false, error: "Usage: /chat <message>" },
  async start(rt: Runtime, sessionId: Id, { startId, prompt, llm }) { await rt.run(sessionId, "chatTurn", { anchor: startId, text: prompt, llm: llm ?? rt.llm.defaultSelection }); },
  overview(view: SessionView) { const start = view.artifacts.findLast((a) => a.type === "WorkflowStart"); return ["# Conversation\n" + ((start?.data as { title?: string } | undefined)?.title ?? "")]; },
};
export const chatPlugin = definePlugin({ id: "chat", workflows: [chat] });
