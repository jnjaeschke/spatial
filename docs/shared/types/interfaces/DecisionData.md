[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/types](../README.md) / DecisionData

# Interface: DecisionData

Data of a `Decision` artifact: a question a workflow asked after the epoch the artifact is stamped with. `chosen` is null while it is open. The user's answer is a new verified version linked `revises →` the open one; a rule's answer is stored already chosen, with its reason.

## Properties

### chosen

> **chosen**: \{ `by`: `"user"` \| `"rule"`; `llm?`: [`LlmSelection`](LlmSelection.md); `option`: `string`; `reason?`: `string`; `text?`: `string`; \} \| `null`

***

### options

> **options**: [`DecisionOption`](DecisionOption.md)[]

***

### question

> **question**: `string`
