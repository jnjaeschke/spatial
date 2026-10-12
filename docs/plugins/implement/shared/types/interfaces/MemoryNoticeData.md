[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/shared/types](../README.md) / MemoryNoticeData

# Interface: MemoryNoticeData

Tells the user a steer was remembered (artifact `MemoryNotice`, verified, linked `about →` the steer). Carries the whole memory: the knowledge store cannot read a superseded version, and "Edit instead" restores it.

## Properties

### entryId

> **entryId**: `string`

***

### key

> **key**: `string`

***

### memory

> **memory**: [`SteerMemory`](SteerMemory.md)

***

### scope

> **scope**: [`MemoryScope`](../type-aliases/MemoryScope.md)
