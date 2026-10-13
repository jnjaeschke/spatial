[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/review/api](../README.md) / RoundPhaseInput

# Interface: RoundPhaseInput

`until`: Unix seconds of the next submit of these revisions; Phabricator comments created from then on belong to later rounds. Absent for the latest round.

## Properties

### llm?

> `optional` **llm?**: [`LlmSelection`](../../../../shared/types/interfaces/LlmSelection.md)

***

### narrate

> **narrate**: `boolean`

***

### round

> **round**: [`RoundSource`](../type-aliases/RoundSource.md)

***

### until?

> `optional` **until?**: `number`
