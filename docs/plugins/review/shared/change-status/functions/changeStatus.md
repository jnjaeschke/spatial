[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/shared/change-status](../README.md) / changeStatus

# Function: changeStatus()

> **changeStatus**(`hunkIds`, `statuses`): [`ChangeStatus`](../../types/type-aliases/ChangeStatus.md)

`unchanged` when every hunk is unchanged, `new` when every hunk is new, else `modified`.

## Parameters

### hunkIds

`string`[]

### statuses

`Map`\<`string`, [`ChangeStatus`](../../types/type-aliases/ChangeStatus.md)\>

## Returns

[`ChangeStatus`](../../types/type-aliases/ChangeStatus.md)
