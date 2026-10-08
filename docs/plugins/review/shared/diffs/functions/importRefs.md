[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/review/shared/diffs](../README.md) / importRefs

# Function: importRefs()

> **importRefs**(`tasks`, `diffId`): \{ `base`: `string`; `head`: `string`; \} \| `null`

Refs that produced `diffId`: the input of the succeeded `importDiff` task whose `output.diffId` is that Diff; null when none.

## Parameters

### tasks

[`TaskRecord`](../../../../../shared/types/interfaces/TaskRecord.md)[]

### diffId

`string`

## Returns

\{ `base`: `string`; `head`: `string`; \} \| `null`
