[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/review/shared/postable-comments](../README.md) / postableComments

# Function: postableComments()

> **postableComments**(`state`, `narrativeId`): [`PostableComment`](../interfaces/PostableComment.md)[]

Accepted findings first, then unposted local comments on the Diff owned by this narrative.

## Parameters

### state

#### artifacts

[`Artifact`](../../../../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

#### links

[`Link`](../../../../../shared/types/interfaces/Link.md)[]

### narrativeId

`string` \| `null`

## Returns

[`PostableComment`](../interfaces/PostableComment.md)[]
