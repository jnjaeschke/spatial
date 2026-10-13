# AGENTS.md

## Working Principles

- Understand the relevant code before changing it. Inspect existing implementations, patterns, tests, and documentation rather than inferring behavior from names or assumptions.
- Treat user requests as statements of intent, not necessarily as correct implementation instructions. Question assumptions and propose simpler or more robust solutions when appropriate.
- Push back when a requested approach is unnecessarily complex, inconsistent with the architecture, or likely to create future problems.
- Once the user has explicitly chosen among reasonable alternatives, implement that decision unless new evidence justifies revisiting it.
- Prefer the smallest coherent solution that satisfies the current requirement.
- Apply KISS, YAGNI, DRY, and appropriate object-oriented design.
- Do not introduce abstractions, extension points, providers, configuration options, compatibility layers, or generic frameworks for hypothetical future requirements.
- Temporary duplication is preferable to a premature or incorrect abstraction.
- Keep changes focused. Do not mix unrelated cleanup or refactoring into a change unless it is necessary.
- If a feature appears to require substantially more machinery than its value justifies, reconsider the design before adding the machinery.

## Architecture

- The runtime owns authoritative state, effects, permissions, and provenance.
- LLM output is interpretation or proposal, not authoritative truth when facts can be established deterministically.
- Prefer deterministic mechanisms for facts and verification. Use LLMs for reasoning, interpretation, synthesis, planning, and work that genuinely benefits from them.
- Preserve the distinction between source facts, derived artifacts, and LLM-generated interpretation.
- Prefer explicit data flow and inspectable state transitions over hidden global state or implicit behavior.
- Do not make UI representation canonical application state. Views are projections over underlying semantic state.
- Future ideas and design explorations are context, not requirements. Do not implement them unless they are necessary for the current task.

## Code Quality

- Keep code simple, direct, and readable.
- Comments should explain why, non-obvious constraints, invariants, or surprising behavior. Do not narrate obvious code.
- Be sparse with comments.
- A change to the SQLite schema or to the shape of stored artifact or knowledge data needs a new migration appended to `STORE_MIGRATIONS` or `KNOWLEDGE_MIGRATIONS`; released migrations are never edited.
- Public APIs and non-obvious contracts should be documented briefly.
- Do not add boilerplate documentation that merely restates names or types.
- Prefer explicit errors to silent fallback behavior.
- Validate at system boundaries. Do not add defensive fallback paths for states that should be impossible without a concrete reason.
- Prefer platform APIs and existing dependencies where practical.
- Add a dependency only when it materially reduces complexity or provides functionality the project should not reasonably implement itself.
- Avoid speculative performance optimization. Measure first unless the cost is obvious and material.

## Testing and Verification

- Use TDD where it meaningfully helps define behavior before implementation.
- Tests must protect meaningful behavior, contracts, edge cases, or regressions. Do not add tests merely to increase coverage.
- When fixing a bug, reproduce it with a regression test first whenever practical.
- Do not hard-code implementations around tests or weaken tests to make a change pass.
- If an existing test appears incorrect, investigate it rather than assuming the implementation must satisfy it.
- Run the narrowest meaningful verification first, then broaden verification according to the risk and scope of the change.
- New tests should add value. If a test would only duplicate existing coverage without protecting additional behavior, do not add it.
- Before declaring work complete, verify the behavior that was changed.

## Documentation

The repository's versioned documentation is generated from the current source and should describe the codebase as it actually exists.

Generated documentation should help both:

1. human readers understand the structure and public contracts of the system; and
2. LLMs navigate the repository efficiently without repeatedly rediscovering basic architecture.

Prefer generating documentation from authoritative sources such as:

- exported APIs and types;
- task and artifact contracts;
- schemas;
- package/module boundaries;
- dependency relationships;
- registered capabilities, executors, views, or workflows;
- other structured source metadata.

Do not manually duplicate facts that can be reliably derived from source.

Design notes, exploratory architecture documents, brainstorming, and similar working documents are **not versioned repository documentation**. Do not commit them as permanent source-of-truth documentation.

Before completing a feature or refactor:

- determine which generated documentation is affected;
- regenerate or update it using the repository tooling;
- verify that the generated documentation matches the implementation.

Changes that modify documented APIs, contracts, schemas, or architecture are incomplete until the corresponding generated documentation is up to date.

## Working on Existing Code

Before implementing a change:

1. Locate and read the relevant implementation.
2. Inspect nearby tests and existing patterns.
3. Check the generated documentation relevant to the affected subsystem.
4. Identify the smallest useful change.
5. Consider whether the user's proposed implementation is actually the best solution.
6. Implement and verify the change.
7. Update/regenerate affected documentation.

Do not create a parallel mechanism when an existing mechanism can reasonably be extended.

## Scope and Abstractions

Prefer concrete solutions until repeated use demonstrates the correct abstraction.

In particular:

- Do not introduce a generic provider interface solely because multiple providers may exist someday.
- Do not turn a straightforward operation into a workflow unless the workflow boundary provides concrete value.
- Do not decompose work that an LLM can handle effectively into many small deterministic steps merely for architectural purity.
- Do not use an LLM for facts that can be cheaply and reliably established by ordinary software.
- Do not optimize for extensibility before there is a second real use case.
- Do not build package distribution, plugin systems, compatibility layers, or generalized orchestration before they are needed.

When unsure, implement the simpler version and leave room to learn from actual usage.

## Agent Behavior

- Be skeptical of both the user's assumptions and your own.
- Investigate before asserting.
- Clearly distinguish facts from hypotheses.
- Surface uncertainty rather than silently guessing.
- Prefer evidence from the code, tests, runtime behavior, or authoritative documentation.
- When multiple reasonable approaches exist, explain the meaningful tradeoffs and recommend one.
- Do not repeatedly reopen a settled decision without new evidence.
- Do not expand the task into adjacent improvements unless necessary.
- Leave the repository in a working, verified state.
