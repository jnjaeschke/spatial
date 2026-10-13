[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/shared/review-path](../README.md) / changeCommit

# Function: changeCommit()

> **changeCommit**(`diff`, `change`): `number`

Commit that owns a change: that of its first hunk (stack narration validation makes all its hunks agree); the last commit for a change without hunks.

## Parameters

### diff

[`DiffData`](../../../../../shared/types/interfaces/DiffData.md)

### change

[`SemanticChange`](../../types/interfaces/SemanticChange.md)

## Returns

`number`
