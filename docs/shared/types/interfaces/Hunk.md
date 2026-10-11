[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / Hunk

# Interface: Hunk

## Properties

### header

> **header**: `string`

***

### id

> **id**: `string`

`f<fileIndex>h<hunkIndex>`; stable because a Diff artifact is immutable and pinned to SHAs.

***

### lines

> **lines**: [`DiffLine`](DiffLine.md)[]

***

### newLines

> **newLines**: `number`

***

### newStart

> **newStart**: `number`

***

### oldLines

> **oldLines**: `number`

***

### oldStart

> **oldStart**: `number`

***

### rewrites?

> `optional` **rewrites?**: [`Rewrite`](Rewrite.md)[]
