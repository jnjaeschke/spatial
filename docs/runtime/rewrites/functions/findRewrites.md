[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/rewrites](../README.md) / findRewrites

# Function: findRewrites()

> **findRewrites**(`git`, `baseSha`, `commits`, `files`): `Promise`\<`void`\>

Marks squashed hunks where a later commit replaced lines from an earlier one.

## Parameters

### git

[`GitCapability`](../../tasks/interfaces/GitCapability.md)

### baseSha

`string`

### commits

[`Commit`](../../../shared/types/interfaces/Commit.md)[]

### files

[`DiffFile`](../../../shared/types/interfaces/DiffFile.md)[]

## Returns

`Promise`\<`void`\>
