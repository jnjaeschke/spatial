[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/shared/types](../README.md) / FindingCarryData

# Interface: FindingCarryData

Where a finding sits in the Diff `toDiff` after re-anchoring; `hunkId` null means the code is gone. Linked `about → finding`; latest per (finding, toDiff) wins. Verified; no LLM.

## Properties

### finding

> **finding**: `string`

***

### hunkId

> **hunkId**: `string` \| `null`

***

### lines?

> `optional` **lines?**: `object`

#### end

> **end**: `number`

#### path

> **path**: `string`

#### side

> **side**: `"new"` \| `"old"`

#### start

> **start**: `number`

***

### toDiff

> **toDiff**: `string`
