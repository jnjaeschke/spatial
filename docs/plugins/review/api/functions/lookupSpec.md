[**spatial-ide**](../../../../README.md)

***

[spatial-ide](../../../../README.md) / [plugins/review/api](../README.md) / lookupSpec

# Function: lookupSpec()

> **lookupSpec**(`env`, `url`): `Promise`\<[`SpecLookup`](../type-aliases/SpecLookup.md)\>

webspec-index lookup of one URL. One failing lookup (webspec-index can crash on a single spec) is a not-found result, not an error, unless the task was cancelled.

## Parameters

### env

`Pick`\<[`TaskContext`](../../../../runtime/tasks/interfaces/TaskContext.md), `"webspec"` \| `"signal"`\>

### url

`string`

## Returns

`Promise`\<[`SpecLookup`](../type-aliases/SpecLookup.md)\>
