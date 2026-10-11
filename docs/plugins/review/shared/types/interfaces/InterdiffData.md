[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/shared/types](../README.md) / InterdiffData

# Interface: InterdiffData

Data of an `Interdiff` artifact: what the author changed between two revisions, without changes that only come from rebasing. Linked `about → toDiff`. Produced by the `interdiff` task; verified; no LLM. `conflicts` lists paths where replaying the old patch onto the new base conflicted; for those, `files` holds a per-file comparison of the old and new patch hunks instead.

## Properties

### conflicts

> **conflicts**: `string`[]

***

### files

> **files**: [`DiffFile`](../../../../../shared/types/interfaces/DiffFile.md)[]

***

### fromDiff

> **fromDiff**: `string`

***

### toDiff

> **toDiff**: `string`
