[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/spec/api](../README.md) / storedMapping

# Function: storedMapping()

> **storedMapping**(`knowledge`, `engine`, `ref`): [`EngineMapping`](../../shared/types/interfaces/EngineMapping.md) \| `null`

The current mapping of a `SPEC#anchor` ref in an engine, or null when there is none.

## Parameters

### knowledge

`Pick`\<[`Knowledge`](../../../../runtime/knowledge/interfaces/Knowledge.md), `"get"`\>

### engine

[`Engine`](../../../../shared/types/type-aliases/Engine.md)

### ref

`string`

## Returns

[`EngineMapping`](../../shared/types/interfaces/EngineMapping.md) \| `null`
