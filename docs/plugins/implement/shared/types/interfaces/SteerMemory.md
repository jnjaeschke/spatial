[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/shared/types](../README.md) / SteerMemory

# Interface: SteerMemory

A way the user wants the agent to work, distilled from a steer (knowledge store, namespace `implement`, key `memory/<slug>`). Empty `kinds` applies to every investigation kind. `source` is set by the runtime.

## Properties

### kinds

> **kinds**: `string`[]

***

### observed

> **observed**: `string`

***

### phases

> **phases**: `string`[]

***

### situation

> **situation**: `string`

***

### source

> **source**: `object`

#### epoch

> **epoch**: `number`

#### sessionId

> **sessionId**: `string`

#### steer

> **steer**: `string`

***

### wanted

> **wanted**: `string`

***

### why

> **why**: `string` \| `null`
