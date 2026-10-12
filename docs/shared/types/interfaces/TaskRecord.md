[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / TaskRecord

# Interface: TaskRecord

## Properties

### createdAt

> **createdAt**: `string`

***

### epoch

> **epoch**: `number` \| `null`

Latest epoch of the session at creation; null before the first epoch.

***

### error

> **error**: `string` \| `null`

***

### id

> **id**: `string`

***

### input

> **input**: `unknown`

***

### kind

> **kind**: `string`

***

### output

> **output**: `unknown`

***

### parentId

> **parentId**: `string` \| `null`

The task that started this one through `ctx.run`; null for a top-level task.

***

### sessionId

> **sessionId**: `string`

***

### status

> **status**: [`TaskStatus`](../type-aliases/TaskStatus.md)

***

### updatedAt

> **updatedAt**: `string`
