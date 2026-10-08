[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/diffs](../README.md) / sessionRefs

# Function: sessionRefs()

> **sessionRefs**(`artifacts`, `tasks`): \{ `base`: `string`; `head`: `string`; \} \| `null`

Refs the session was created with: `importRefs` of the first Diff (later imports record resolved SHAs). Null when none.

## Parameters

### artifacts

[`Artifact`](../../types/interfaces/Artifact.md)\<`unknown`\>[]

### tasks

[`TaskRecord`](../../types/interfaces/TaskRecord.md)[]

## Returns

\{ `base`: `string`; `head`: `string`; \} \| `null`
