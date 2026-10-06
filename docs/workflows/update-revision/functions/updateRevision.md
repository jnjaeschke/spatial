[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [workflows/update-revision](../README.md) / updateRevision

# Function: updateRevision()

> **updateRevision**(`rt`, `sessionId`): `Promise`\<\{ `diffId`: `string`; `interdiffId`: `string`; \}\>

Imports the session's head ref onto its merge base with the base ref, then the interdiff against the previous Diff. Never narrates.

## Parameters

### rt

[`Runtime`](../../../runtime/tasks/classes/Runtime.md)

### sessionId

`string`

## Returns

`Promise`\<\{ `diffId`: `string`; `interdiffId`: `string`; \}\>
