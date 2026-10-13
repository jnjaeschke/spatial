[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/spec/api](../README.md) / specReferenceData

# Function: specReferenceData()

> **specReferenceData**(`env`, `url`, `result`, `origin`): `Promise`\<[`SpecReferenceData`](../../shared/types/interfaces/SpecReferenceData.md)\>

The `SpecReference` data of a looked-up URL; a found spec in a Gecko repo also gets the Searchfox lines that reference it.

## Parameters

### env

`Pick`\<[`TaskContext`](../../../../runtime/tasks/interfaces/TaskContext.md), `"services"` \| `"repo"` \| `"repoProfiles"` \| `"artifacts"` \| `"signal"`\>

### url

`string`

### result

[`SpecLookup`](../type-aliases/SpecLookup.md)

### origin

`NonNullable`\<`"llm"` \| `"code"` \| `"link"` \| `undefined`\>

## Returns

`Promise`\<[`SpecReferenceData`](../../shared/types/interfaces/SpecReferenceData.md)\>
