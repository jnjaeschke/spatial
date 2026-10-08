import type { Phase } from "../../../plugin-api.ts";
import type { InvestigateInput } from "../tasks/investigate/task.ts";

export const investigatePhase: Phase<InvestigateInput> = { id: "investigate", async run(rt, sessionId, input) { await rt.run(sessionId, "investigate", input); } };
