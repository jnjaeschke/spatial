import { z } from "zod";
import { definePlugin, type Workflow, type Phase, type Runtime, type Id, type LlmSelection, type SessionView } from "../../plugin-api.ts";

const params = z.strictObject({});
interface ChatPhaseInput { anchor: Id; text: string; llm: LlmSelection }
const chatPhase: Phase<ChatPhaseInput> = { id: "chat", async run(rt, sessionId, input) { await rt.run(sessionId, "chatTurn", input); } };
const chat: Workflow<z.infer<typeof params>> = {
  id: "chat", description: "Open conversation about the repository and its code. Use it for anything that is not clearly one of the other workflows.", argHint: "<message>", params,
  parseArgs: (args) => args.trim() ? { ok: true, params: {} } : { ok: false, error: "Usage: /chat <message>" },
  async start(rt: Runtime, sessionId: Id, { startId, prompt, llm }) { await rt.runPhase(sessionId, "chat", { anchor: startId, text: prompt, llm: llm ?? rt.llm.defaultSelection }); },
  overview(view: SessionView) { const start = view.artifacts.findLast((a) => a.type === "WorkflowStart"); return ["# Conversation\n" + ((start?.data as { title?: string } | undefined)?.title ?? "")]; },
};
export const chatPlugin = definePlugin({ id: "chat", workflows: [chat], phases: [chatPhase] });
