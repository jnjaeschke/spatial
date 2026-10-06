[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/types](../README.md) / PatchNarrativeData

# Interface: PatchNarrativeData

Data of a `PatchNarrative` artifact.

## Properties

### changes

> **changes**: [`SemanticChange`](SemanticChange.md)[]

***

### commitIntents?

> `optional` **commitIntents?**: `string`[]

One sentence per stack commit, in commit order, on what the commit achieves within the stack. Present for stacks only.

***

### diffId

> **diffId**: `string`

***

### previous?

> `optional` **previous?**: `string`

Previous epoch's narrative; present when this narrative describes what changed since it.

***

### summary

> **summary**: `string`
