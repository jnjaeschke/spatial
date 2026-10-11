[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / DiffLine

# Interface: DiffLine

## Properties

### commit?

> `optional` **commit?**: `number`

Index into `DiffData.commits` of the commit that added (`add`) or deleted (`del`) this line. Absent for context and single-commit diffs.

***

### commitLine?

> `optional` **commitLine?**: `number`

Line number in that commit's own diff: new side for `add`, old side for `del`.

***

### commitPath?

> `optional` **commitPath?**: `string`

Path in that commit's own diff; only set when it differs from the file's path.

***

### kind

> **kind**: `"ctx"` \| `"add"` \| `"del"`

***

### text

> **text**: `string`
