[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/postable-comments](../README.md) / postableComments

# Function: postableComments()

> **postableComments**(`state`, `narrativeId`): [`PostableComment`](../interfaces/PostableComment.md)[]

Returns each accepted finding's latest verified comment at its current location, unless it was already posted or the finding is outdated or addressed.

## Parameters

### state

#### artifacts

[`Artifact`](../../types/interfaces/Artifact.md)\<`unknown`\>[]

#### links

[`Link`](../../types/interfaces/Link.md)[]

### narrativeId

`string` \| `null`

## Returns

[`PostableComment`](../interfaces/PostableComment.md)[]
