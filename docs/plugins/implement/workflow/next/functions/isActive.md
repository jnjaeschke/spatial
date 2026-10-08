[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/implement/workflow/next](../README.md) / isActive

# Function: isActive()

> **isActive**(`rt`, `sessionId`): `boolean`

Whether an implement session still has work: an epoch is running or `next` has a step. Used to refuse a second session on the same checkout.

## Parameters

### rt

[`Runtime`](../../../../../runtime/tasks/classes/Runtime.md)

### sessionId

`string`

## Returns

`boolean`
