[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/create](../README.md) / makeCodeSearch

# Function: makeCodeSearch()

> **makeCodeSearch**(`searchfox`, `bins`): `Record`\<[`Engine`](../../../shared/types/type-aliases/Engine.md), [`CodeSearch`](../../code-search/interfaces/CodeSearch.md)\>

The code search of every engine: Gecko over `searchfox`, WebKit over searchfox's `wubkat` repository, Blink over chromium-search.

## Parameters

### searchfox

[`SearchfoxCapability`](../../tasks/interfaces/SearchfoxCapability.md)

### bins

#### chromiumSearchBin?

`string`

#### searchfoxBin?

`string`

## Returns

`Record`\<[`Engine`](../../../shared/types/type-aliases/Engine.md), [`CodeSearch`](../../code-search/interfaces/CodeSearch.md)\>
