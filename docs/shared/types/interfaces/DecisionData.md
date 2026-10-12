[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / DecisionData

# Interface: DecisionData

Data of a `Decision` artifact: a question a workflow asked after the epoch the artifact is stamped with. `key` identifies the decision within its epoch (the runtime and the workflows match on key and epoch); `question` is display text only. `chosen` is null while it is open. The user's answer is a new verified version linked `revises →` the open one; a rule's answer is stored already chosen, with its reason.

## Properties

### chosen

> **chosen**: \{ `by`: `"user"` \| `"rule"`; `llm?`: [`LlmSelection`](LlmSelection.md); `option`: `string`; `reason?`: `string`; `text?`: `string`; \} \| `null`

***

### key

> **key**: `string`

***

### options

> **options**: [`DecisionOption`](DecisionOption.md)[]

***

### question

> **question**: `string`
