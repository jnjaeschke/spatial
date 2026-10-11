[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/shared/review-path](../README.md) / withUnassigned

# Function: withUnassigned()

> **withUnassigned**(`narrative`, `diff`): [`SemanticChange`](../../../../../shared/types/interfaces/SemanticChange.md)[]

The narrative's changes plus, per commit with hunks no change claims, a trailing "Unassigned changes" change `unassigned-C<n>` (in diff order) after that commit's last change.

## Parameters

### narrative

[`PatchNarrativeData`](../../../../../shared/types/interfaces/PatchNarrativeData.md)

### diff

[`DiffData`](../../../../../shared/types/interfaces/DiffData.md)

## Returns

[`SemanticChange`](../../../../../shared/types/interfaces/SemanticChange.md)[]
