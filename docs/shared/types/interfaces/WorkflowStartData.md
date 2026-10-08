[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/types](../README.md) / WorkflowStartData

# Interface: WorkflowStartData

Data of a `WorkflowStart` artifact: the request that started the session and the workflow chosen for it.

## Properties

### llm?

> `optional` **llm?**: [`LlmSelection`](LlmSelection.md)

The start box selection later phases reuse: the model for investigate and review, and how much the implement agent may do.

***

### params

> **params**: `unknown`

***

### prompt

> **prompt**: `string`

***

### title

> **title**: `string`

***

### via

> **via**: `"command"` \| `"selector"`

***

### workflow

> **workflow**: `string`

***

### writeMode?

> `optional` **writeMode?**: [`WriteMode`](../type-aliases/WriteMode.md)
