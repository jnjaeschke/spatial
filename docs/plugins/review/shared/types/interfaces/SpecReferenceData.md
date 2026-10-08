[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/review/shared/types](../README.md) / SpecReferenceData

# Interface: SpecReferenceData

Data of a `SpecReference` artifact. `resolved` null means webspec-index could not resolve `url`.

## Properties

### geckoRefs

> **geckoRefs**: [`GeckoSpecRef`](../../../../../shared/types/interfaces/GeckoSpecRef.md)[]

***

### geckoRefsError?

> `optional` **geckoRefsError?**: `string`

***

### origin?

> `optional` **origin?**: `"llm"` \| `"code"`

Whether the reference was found in changed code or inferred by the narrative.

***

### reason?

> `optional` **reason?**: `string`

***

### resolved

> **resolved**: [`ResolvedSpec`](../../../../../shared/types/interfaces/ResolvedSpec.md) \| `null`

***

### url

> **url**: `string`
