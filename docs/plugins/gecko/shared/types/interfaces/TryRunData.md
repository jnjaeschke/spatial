[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/gecko/shared/types](../README.md) / TryRunData

# Interface: TryRunData

One observed state of a push (artifact `TryRun`, verified), stored only when it changed. `counts` are Treeherder's job state counts; `error` is set when Treeherder could not be read.

## Properties

### complete

> **complete**: `boolean`

***

### counts

> **counts**: `Record`\<`string`, `number`\>

***

### error

> **error**: `string` \| `null`

***

### failures

> **failures**: [`TryFailure`](TryFailure.md)[]

***

### push

> **push**: `string`

***

### pushId

> **pushId**: `number` \| `null`

***

### revision

> **revision**: `string` \| `null`

***

### url

> **url**: `string`
