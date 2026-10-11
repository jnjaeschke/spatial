[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/shared/phab-comments](../README.md) / latestByPhid

# Function: latestByPhid()

> **latestByPhid**(`artifacts`): `Map`\<`string`, [`Artifact`](../../../../../shared/types/interfaces/Artifact.md)\<[`PhabCommentData`](../../types/interfaces/PhabCommentData.md)\>\>

Latest artifact of every remote comment by `phid`: highest version, then newest.

## Parameters

### artifacts

[`Artifact`](../../../../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

## Returns

`Map`\<`string`, [`Artifact`](../../../../../shared/types/interfaces/Artifact.md)\<[`PhabCommentData`](../../types/interfaces/PhabCommentData.md)\>\>
