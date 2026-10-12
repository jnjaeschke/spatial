[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/workflow/next](../README.md) / isActive

# Function: isActive()

> **isActive**(`rt`, `sessionId`): `boolean`

Whether an implement session still holds its checkout: an epoch is running, the session has a next step (an open decision included), or the latest epoch of a phase the workflow owns failed or was cancelled and can be retried. An abandoned session holds nothing. Used to refuse a second session on the same checkout.

## Parameters

### rt

[`Runtime`](../../../../../runtime/tasks/classes/Runtime.md)

### sessionId

`string`

## Returns

`boolean`
