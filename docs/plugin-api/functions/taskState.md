[**spatial**](../../README.md)

***

[spatial](../../README.md) / [plugin-api](../README.md) / taskState

# Function: taskState()

> **taskState**(`tasks`, `kinds`, `matches`): `object`

Whether a task of `kinds` whose input `matches` is active, else the error of the latest such task when it failed.

## Parameters

### tasks

`Pick`\<[`TaskRecord`](../../shared/types/interfaces/TaskRecord.md), `"error"` \| `"kind"` \| `"status"` \| `"input"`\>[]

### kinds

`string`[]

### matches

(`input`) => `boolean`

## Returns

`object`

### busy

> **busy**: `boolean`

### failed

> **failed**: `string` \| `null`
