[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/findings](../README.md) / FindingState

# Interface: FindingState

## Properties

### anchor

> **anchor**: `string` \| `null`

Current location; `outdated` findings have null anchor, no quote and no lines.

***

### collapsedByDefault

> **collapsedByDefault**: `boolean`

Addressed, dismissed or outdated.

***

### decision

> **decision**: `"accepted"` \| `"dismissed"` \| `null`

***

### epoch

> **epoch**: `number`

Epoch the finding was raised in.

***

### finding

> **finding**: [`Artifact`](../../types/interfaces/Artifact.md)\<[`ReviewFindingData`](../../types/interfaces/ReviewFindingData.md)\>

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

### outdated

> **outdated**: `boolean`

***

### quote?

> `optional` **quote?**: `string`

***

### status

> **status**: [`FindingStatus`](../type-aliases/FindingStatus.md)

***

### verdict

> **verdict**: [`FindingVerdictData`](../../types/interfaces/FindingVerdictData.md) \| `null`
