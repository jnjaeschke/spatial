[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/types](../README.md) / SpecReferenceData

# Interface: SpecReferenceData

Data of a `SpecReference` artifact. `resolved` null means webspec-index could not resolve `url`.

## Properties

### geckoRefs

> **geckoRefs**: [`GeckoSpecRef`](GeckoSpecRef.md)[]

***

### geckoRefsError?

> `optional` **geckoRefsError?**: `string`

***

### origin?

> `optional` **origin?**: `"code"` \| `"llm"`

Whether the reference was found in changed code or inferred by the narrative.

***

### reason?

> `optional` **reason?**: `string`

***

### resolved

> **resolved**: [`ResolvedSpec`](ResolvedSpec.md) \| `null`

***

### url

> **url**: `string`
