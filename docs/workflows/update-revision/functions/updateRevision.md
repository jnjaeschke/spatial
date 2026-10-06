[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [workflows/update-revision](../README.md) / updateRevision

# Function: updateRevision()

> **updateRevision**(`rt`, `sessionId`, `llm?`): `Promise`\<\{ `diffId`: `string`; `interdiffId`: `string`; `narrativeId`: `string`; \}\>

Imports the session's head ref onto its merge base with the base ref, computes the interdiff against the previous Diff, then narrates and reviews it. Runs LLM tasks; call only on an explicit user request.

## Parameters

### rt

[`Runtime`](../../../runtime/tasks/classes/Runtime.md)

### sessionId

`string`

### llm?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

## Returns

`Promise`\<\{ `diffId`: `string`; `interdiffId`: `string`; `narrativeId`: `string`; \}\>
