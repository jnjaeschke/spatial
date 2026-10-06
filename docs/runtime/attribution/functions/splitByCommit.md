[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/attribution](../README.md) / splitByCommit

# Function: splitByCommit()

> **splitByCommit**(`files`, `commitCount`): `void`

For stacks: splits every squashed hunk where the owning commit of its changed lines changes, so each hunk holds changed lines of one commit, then renumbers hunk ids per file (`f<file>h<n>`). Line order and numbering are kept, so the whole-file rows (`fileRows`) are unchanged. Context lines stay with the run before them; leading context stays with the first run; unattributed changed lines join the current run. A hunk with one run is kept as is. No-op for single-commit diffs.

## Parameters

### files

[`DiffFile`](../../../shared/types/interfaces/DiffFile.md)[]

### commitCount

`number`

## Returns

`void`
