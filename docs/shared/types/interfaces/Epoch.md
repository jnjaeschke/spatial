[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/types](../README.md) / Epoch

# Interface: Epoch

One run of a phase. `n` is 1-based and monotonic per session; artifacts and tasks record the epoch that was latest when they were created.

## Properties

### endedAt

> **endedAt**: `string` \| `null`

***

### error

> **error**: `string` \| `null`

***

### input

> **input**: `unknown`

***

### n

> **n**: `number`

***

### phase

> **phase**: `string`

***

### sessionId

> **sessionId**: `string`

***

### startedAt

> **startedAt**: `string`

***

### status

> **status**: [`EpochStatus`](../type-aliases/EpochStatus.md)
