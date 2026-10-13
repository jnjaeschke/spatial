[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/scm/runtime/scm](../README.md) / diffFiles

# Function: diffFiles()

> **diffFiles**(`repo`, `a`, `b`, `paths?`): `Promise`\<[`DiffFile`](../../../../../shared/types/interfaces/DiffFile.md)[]\>

The parsed diff from `a` (null: the empty tree) to `b`, optionally limited to `paths` (give both paths of a rename so git still pairs them).

## Parameters

### repo

`string`

### a

`string` \| `null`

### b

`string`

### paths?

`string`[]

## Returns

`Promise`\<[`DiffFile`](../../../../../shared/types/interfaces/DiffFile.md)[]\>
