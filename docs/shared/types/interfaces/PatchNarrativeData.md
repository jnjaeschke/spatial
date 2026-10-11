[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / PatchNarrativeData

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

### flowHints?

> `optional` **flowHints?**: (`string` \| `null`)[]

Per stack commit, in commit order: a short phrase naming the runtime flow a sequence diagram would explain, or null. Present for stacks only.

***

### previous?

> `optional` **previous?**: `string`

Previous epoch's narrative; present when this narrative describes what changed since it.

***

### summary

> **summary**: `string`
