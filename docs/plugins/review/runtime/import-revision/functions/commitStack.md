[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/runtime/import-revision](../README.md) / commitStack

# Function: commitStack()

> **commitStack**(`repo`, `host`, `base`, `patches`): `Promise`\<`string`\>

Commits each patch on the previous one starting at `base`, with a revision trailer and spatial ref; returns the last commit.

## Parameters

### repo

`string`

### host

`string`

### base

`string`

### patches

`object`[]

## Returns

`Promise`\<`string`\>
