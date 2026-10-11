[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / DiffData

# Interface: DiffData

Data of a `Diff` artifact.

## Properties

### baseSha

> **baseSha**: `string`

***

### commits

> **commits**: [`Commit`](Commit.md)[]

***

### files

> **files**: [`DiffFile`](DiffFile.md)[]

***

### headSha

> **headSha**: `string`

***

### upstreamRev?

> `optional` **upstreamRev?**: `string`

Upstream commit the patch applies to (merge-base of base with `main`); Searchfox links pin to it. Absent when unknown.
