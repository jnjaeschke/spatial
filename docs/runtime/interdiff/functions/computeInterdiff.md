[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/interdiff](../README.md) / computeInterdiff

# Function: computeInterdiff()

> **computeInterdiff**(`git`, `from`, `to`): `Promise`\<\{ `conflicts`: `string`[]; `files`: [`DiffFile`](../../../shared/types/interfaces/DiffFile.md)[]; \}\>

What the author changed between two revisions of the same patch.

## Parameters

### git

[`GitCapability`](../../tasks/interfaces/GitCapability.md)

### from

[`DiffData`](../../../shared/types/interfaces/DiffData.md)

### to

[`DiffData`](../../../shared/types/interfaces/DiffData.md)

## Returns

`Promise`\<\{ `conflicts`: `string`[]; `files`: [`DiffFile`](../../../shared/types/interfaces/DiffFile.md)[]; \}\>
