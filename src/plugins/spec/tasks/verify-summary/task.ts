import { defineTask } from "../../../../plugin-api.ts";
import { runVerdicts, type Verdict } from "../verdicts.ts";
import { DATA_PREAMBLE, fence } from "../../shared/prompt.ts";
import type { SpecAlgorithmData, SpecSummary } from "../../shared/types.ts";
import { parseSteps } from "../../shared/steps.ts";
import { citedText } from "../../shared/summary-check.ts";

const SYSTEM = "You check a summary of a web spec algorithm adversarially. For each clause, decide whether its cited steps fully support it: anything the steps do not state, or state differently, is unsupported. Give a one-sentence reason per clause.";

/** An adversarial LLM verdict per summary clause against its cited steps. */
export const verifySummary = defineTask<{ algorithmId: string; clauses: SpecSummary["clauses"] }, { clauses: Verdict[] }>({
  kind: "verifySummary",
  async run(ctx, { algorithmId, clauses }) {
    const algorithm = ctx.artifacts.get<SpecAlgorithmData>(algorithmId);
    const steps = parseSteps(algorithm.data.content);
    const prompt = [DATA_PREAMBLE, ...clauses.map((clause, index) => [`## Clause ${index + 1}`, fence(clause.text), "", "Cited steps:", fence(clause.steps.map((path) => `[${path}] ${citedText(steps, path)}`).join("\n"))].join("\n"))].join("\n\n");
    return { clauses: await runVerdicts(ctx, { field: "clauses", count: clauses.length, system: SYSTEM, prompt, label: "Summary verdicts" }) };
  },
});
