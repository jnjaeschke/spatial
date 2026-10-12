[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/scm](../README.md) / changedFiles

# Function: changedFiles()

> **changedFiles**(`repo`, `a`, `b`): `Promise`\<[`CommitFileStat`](../../../shared/types/interfaces/CommitFileStat.md)[]\>

The files changed from `a` (null: the empty tree) to `b`, with line counts.

## Parameters

### repo

`string`

### a

`string` \| `null`

### b

`string`

## Returns

`Promise`\<[`CommitFileStat`](../../../shared/types/interfaces/CommitFileStat.md)[]\>
