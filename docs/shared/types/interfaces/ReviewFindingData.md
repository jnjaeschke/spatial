[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/types](../README.md) / ReviewFindingData

# Interface: ReviewFindingData

Data of a `ReviewFinding` artifact; linked `derivedFrom → narrative` and `about → anchor`. `anchor`, `quote`, `lines` mean the same as on `ChatThreadData`.

## Properties

### anchor

> **anchor**: `string`

***

### body

> **body**: `string`

***

### category

> **category**: `"correctness"` \| `"spec"` \| `"tests"` \| `"style"`

***

### lines?

> `optional` **lines?**: `object`

#### end

> **end**: `number`

#### path

> **path**: `string`

#### side

> **side**: `"old"` \| `"new"`

#### start

> **start**: `number`

***

### quote?

> `optional` **quote?**: `string`

***

### severity

> **severity**: `"high"` \| `"medium"` \| `"low"`

***

### title

> **title**: `string`
