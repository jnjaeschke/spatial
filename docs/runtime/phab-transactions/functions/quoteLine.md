[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/phab-transactions](../README.md) / quoteLine

# Function: quoteLine()

> **quoteLine**(`files`, `path`, `line`, `isNewFile`): `string` \| `undefined`

Text of `line` of `path` in a parsed raw diff: new side (`add`/`ctx` rows) or old side (`del` rows only).

## Parameters

### files

[`DiffFile`](../../../shared/types/interfaces/DiffFile.md)[]

### path

`string`

### line

`number`

### isNewFile

`boolean`

## Returns

`string` \| `undefined`
