[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/spec/api](../README.md) / resolveSpecReference

# Function: resolveSpecReference()

> **resolveSpecReference**(`env`, `url`, `origin`): `Promise`\<[`SpecReferenceData`](../../shared/types/interfaces/SpecReferenceData.md)\>

Resolves a spec URL exactly as `resolveSpecRefs` does for a citation.

## Parameters

### env

`Pick`\<[`TaskContext`](../../../../runtime/tasks/interfaces/TaskContext.md), `"services"` \| `"repo"` \| `"signal"`\>

### url

`string`

### origin

`NonNullable`\<`"llm"` \| `"code"` \| `"link"` \| `undefined`\>

## Returns

`Promise`\<[`SpecReferenceData`](../../shared/types/interfaces/SpecReferenceData.md)\>
