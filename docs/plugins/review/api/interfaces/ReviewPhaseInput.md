[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/review/api](../README.md) / ReviewPhaseInput

# Interface: ReviewPhaseInput

`recheck`: findings the review must give a verdict on besides the accepted ones, because the round before it was asked to fix them.

## Properties

### base

> **base**: `string`

***

### diffId?

> `optional` **diffId?**: `string`

***

### head

> **head**: `string`

***

### llm?

> `optional` **llm?**: [`LlmSelection`](../../../../shared/types/interfaces/LlmSelection.md)

***

### recheck?

> `optional` **recheck?**: `string`[]

***

### update

> **update**: `boolean`
