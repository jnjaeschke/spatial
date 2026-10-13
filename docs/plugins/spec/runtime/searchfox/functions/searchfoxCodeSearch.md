[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/runtime/searchfox](../README.md) / searchfoxCodeSearch

# Function: searchfoxCodeSearch()

> **searchfoxCodeSearch**(`engine`, `searchfox`): [`CodeSearch`](../../code-search/interfaces/CodeSearch.md)

`CodeSearch` over a searchfox repository (searchfox indexes Gecko and WebKit), which pins every revision and indexes functions; a missing file (`404 Not Found`) reads as null.

## Parameters

### engine

`"gecko"` \| `"webkit"`

### searchfox

[`SearchfoxCapability`](../interfaces/SearchfoxCapability.md)

## Returns

[`CodeSearch`](../../code-search/interfaces/CodeSearch.md)
