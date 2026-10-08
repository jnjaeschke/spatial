[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/review/shared/diffs](../README.md) / sessionRefs

# Function: sessionRefs()

> **sessionRefs**(`artifacts`, `tasks`): \{ `base`: `string`; `head`: `string`; \} \| `null`

Refs the session was created with: `importRefs` of the first Diff (later imports record resolved SHAs). Null when none.

## Parameters

### artifacts

[`Artifact`](../../../../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

### tasks

[`TaskRecord`](../../../../../shared/types/interfaces/TaskRecord.md)[]

## Returns

\{ `base`: `string`; `head`: `string`; \} \| `null`
