[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/shared/types](../README.md) / ReviewFindingData

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

> **category**: `"spec"` \| `"correctness"` \| `"tests"` \| `"style"`

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

### quote?

> `optional` **quote?**: `string`

***

### severity

> **severity**: `"high"` \| `"medium"` \| `"low"`

***

### title

> **title**: `string`
