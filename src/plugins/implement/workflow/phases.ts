import type { Phase } from "../../../plugin-api.ts";
import type { InvestigateInput } from "../tasks/investigate/task.ts";
import type { ImplementInput } from "../tasks/implement/task.ts";
import type { ReviewerCommentsInput } from "../shared/types.ts";
import type { AdoptInput, AdoptRangeInput } from "../shared/types.ts";

export const investigatePhase: Phase<InvestigateInput> = { id: "investigate", async run(rt, sessionId, input) { await rt.run(sessionId, "investigate", input); } };
export const implementPhase: Phase<ImplementInput> = { id: "implement", async run(rt, sessionId, input) { await rt.run(sessionId, "implement", input); } };
export const reviewerCommentsPhase: Phase<ReviewerCommentsInput> = { id: "reviewerComments", async run(rt, sessionId, input) { await rt.run(sessionId, "interpretComments", input); } };
export const adoptPhase: Phase<AdoptInput> = { id: "adopt", async run(rt, sessionId, input) { await rt.run(sessionId, "adoptPlan", input); } };
export const adoptRangePhase: Phase<AdoptRangeInput> = { id: "adoptRange", async run(rt, sessionId, input) { await rt.run(sessionId, "adoptRange", input); } };
