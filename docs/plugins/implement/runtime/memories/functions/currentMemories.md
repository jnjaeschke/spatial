[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/runtime/memories](../README.md) / currentMemories

# Function: currentMemories()

> **currentMemories**(`knowledge`, `repoDir`, `sessionId?`): [`MemoryView`](../../../shared/types/interfaces/MemoryView.md)[]

The current, non-tombstoned memories of the session (when given), then the repository's, then the global ones, each ordered by slug.

## Parameters

### knowledge

`Pick`\<[`Knowledge`](../../../../../runtime/knowledge/interfaces/Knowledge.md), `"list"`\>

### repoDir

`string`

### sessionId?

`string`

## Returns

[`MemoryView`](../../../shared/types/interfaces/MemoryView.md)[]
