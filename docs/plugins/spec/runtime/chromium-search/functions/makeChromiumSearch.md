[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/runtime/chromium-search](../README.md) / makeChromiumSearch

# Function: makeChromiumSearch()

> **makeChromiumSearch**(`opts?`): [`CodeSearch`](../../code-search/interfaces/CodeSearch.md)

`CodeSearch` over Chromium (`chromium-search`) at `main`: spec links by a one-line regex search, functions by brace scan. Files are kept
for a few minutes, so the references and scopes of one mapping run read the same revision of a file.

## Parameters

### opts?

#### bin?

`string`

## Returns

[`CodeSearch`](../../code-search/interfaces/CodeSearch.md)
