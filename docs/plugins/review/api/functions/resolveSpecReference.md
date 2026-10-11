[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/review/api](../README.md) / resolveSpecReference

# Function: resolveSpecReference()

> **resolveSpecReference**(`env`, `url`, `origin`): `Promise`\<[`SpecReferenceData`](../../shared/types/interfaces/SpecReferenceData.md)\>

Resolves a spec URL exactly as `resolveSpecRefs` does for a citation.

## Parameters

### env

`Pick`\<[`TaskContext`](../../../../runtime/tasks/interfaces/TaskContext.md), `"webspec"` \| `"searchfox"` \| `"repo"` \| `"signal"`\>

### url

`string`

### origin

`NonNullable`\<`"llm"` \| `"link"` \| `"code"` \| `undefined`\>

## Returns

`Promise`\<[`SpecReferenceData`](../../shared/types/interfaces/SpecReferenceData.md)\>
