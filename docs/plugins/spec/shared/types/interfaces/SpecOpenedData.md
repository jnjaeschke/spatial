[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/shared/types](../README.md) / SpecOpenedData

# Interface: SpecOpenedData

Data of a `SpecOpened` artifact (user): a box was opened as a root (`from` null) or from step `from.step` (empty when the link is outside any step) of box `from.anchor`. Refs are `SPEC#anchor`.

## Properties

### anchor

> **anchor**: `string`

***

### from

> **from**: \{ `anchor`: `string`; `step`: `string`; \} \| `null`
