[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/runtime/memories](../README.md) / relevantMemories

# Function: relevantMemories()

> **relevantMemories**(`knowledge`, `repoDir`, `phase`, `kind`): [`MemoryView`](../../../shared/types/interfaces/MemoryView.md)[]

The memories for a phase: those listing the phase and applying to every kind or to `kind`. A null kind (not known yet) matches the kind-agnostic ones only.

## Parameters

### knowledge

`Pick`\<[`Knowledge`](../../../../../runtime/knowledge/interfaces/Knowledge.md), `"list"`\>

### repoDir

`string`

### phase

`string`

### kind

`string` \| `null`

## Returns

[`MemoryView`](../../../shared/types/interfaces/MemoryView.md)[]
