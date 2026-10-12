[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/scm](../README.md) / hasCommitGraph

# Function: hasCommitGraph()

> **hasCommitGraph**(`repo`): `Promise`\<`boolean`\>

Whether the repository has a commit-graph file; without one `--topo-order` walks the whole history before the first row.

## Parameters

### repo

`string`

## Returns

`Promise`\<`boolean`\>
