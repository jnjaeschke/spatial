[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/scm/shared/refs](../README.md) / groupRefs

# Function: groupRefs()

> **groupRefs**(`refs`): `object`

Local branches (checked out ones first, then newest first), remote branches without a local counterpart (newest first), and tags.

## Parameters

### refs

[`RefRow`](../../../../../shared/types/interfaces/RefRow.md)[]

## Returns

`object`

### local

> **local**: [`LocalRef`](../type-aliases/LocalRef.md)[]

### remoteOnly

> **remoteOnly**: [`RefRow`](../../../../../shared/types/interfaces/RefRow.md)[]

### tags

> **tags**: [`RefRow`](../../../../../shared/types/interfaces/RefRow.md)[]
