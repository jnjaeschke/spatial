[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/shared/types](../README.md) / SpecReferenceData

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

> `optional` **origin?**: `"llm"` \| `"code"` \| `"link"`

Whether the reference was found in changed code, inferred by the narrative, or followed from a spec link.

***

### reason?

> `optional` **reason?**: `string`

***

### resolved

> **resolved**: [`ResolvedSpec`](ResolvedSpec.md) \| `null`

***

### url

> **url**: `string`
