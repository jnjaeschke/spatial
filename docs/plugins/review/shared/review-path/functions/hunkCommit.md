[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/review/shared/review-path](../README.md) / hunkCommit

# Function: hunkCommit()

> **hunkCommit**(`diff`, `hunk`): `number`

Commit (index into `diff.commits`) that owns a hunk: the commit of its first attributed changed line. A hunk without attributed lines belongs to the last commit, as unattributed new-side lines do when posting (`postTarget`). 0 for single-commit diffs.

## Parameters

### diff

[`DiffData`](../../../../../shared/types/interfaces/DiffData.md)

### hunk

[`Hunk`](../../../../../shared/types/interfaces/Hunk.md)

## Returns

`number`
