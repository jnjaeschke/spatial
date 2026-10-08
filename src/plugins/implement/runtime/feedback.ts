/** The prompt sections that tell the implement agent what to change besides the plan; empty sections are left out. */
export function feedbackSections(input: { text: string | null; notes: string[]; threads: string[]; findings: string[] }): string[] {
  return [
    ...(input.text ? ["# Revision request", input.text] : []),
    ...(input.findings.length ? ["# Findings to fix", input.findings.join("\n\n")] : []),
    ...(input.notes.length ? ["# Notes from the user", input.notes.map((note) => `- ${note}`).join("\n")] : []),
    ...(input.threads.length ? ["# Chat threads", ...input.threads] : []),
  ];
}
