import { defineTask, type Id } from "../../../../plugin-api.ts";
import { runVerdicts, type Verdict } from "../verdicts.ts";
import type { EngineDifference } from "../../shared/types.ts";
import { DATA_PREAMBLE, fence } from "../../shared/prompt.ts";

const SYSTEM = "You check claimed differences between browser engines adversarially. For each difference, decide whether its cited steps and code lines fully support the summary and every claim: anything they do not show is unsupported. Give a one-sentence reason per difference.";

/** An adversarial LLM verdict per difference against its cited steps and code. */
export const verifyComparison = defineTask<{ algorithmId: Id; differences: EngineDifference[]; evidence: string[] }, { differences: Verdict[] }>({
  kind: "verifyComparison",
  async run(ctx, { differences, evidence }) {
    const prompt = [DATA_PREAMBLE, "", ...differences.map((difference, index) => [`## Difference ${index + 1} (${difference.kind})`, fence(evidence[index]!)].join("\n"))].join("\n\n");
    return { differences: await runVerdicts(ctx, { field: "differences", count: differences.length, system: SYSTEM, prompt, label: "Comparison verdicts" }) };
  },
});
