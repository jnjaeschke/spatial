[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/review/runtime/attribution](../README.md) / attribute

# Function: attribute()

> **attribute**(`git`, `baseSha`, `headSha`, `commits`, `files`): `Promise`\<`void`\>

Sets commit attribution on changed lines in place. Single-commit diffs need no blame.

## Parameters

### git

[`GitCapability`](../../../../../runtime/tasks/interfaces/GitCapability.md)

### baseSha

`string`

### headSha

`string`

### commits

[`Commit`](../../../../../shared/types/interfaces/Commit.md)[]

### files

[`DiffFile`](../../../../../shared/types/interfaces/DiffFile.md)[]

## Returns

`Promise`\<`void`\>
