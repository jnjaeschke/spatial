[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/types](../README.md) / SequenceStep

# Interface: SequenceStep

One call between lanes (`from === to` for a self step). The runtime sets `verified`, `text` (the matched source line, trimmed) and moves `cite.line` to the matched line.

## Properties

### call

> **call**: `string`

***

### cite

> **cite**: [`DiagramCite`](DiagramCite.md)

***

### from

> **from**: `string`

***

### guard

> **guard**: `string` \| `null`

***

### identifier

> **identifier**: `string`

***

### phase

> **phase**: `string` \| `null`

***

### status

> **status**: [`SequenceStatus`](../type-aliases/SequenceStatus.md)

***

### text

> **text**: `string` \| `null`

***

### to

> **to**: `string`

***

### verified

> **verified**: `boolean`

***

### what

> **what**: `string`

***

### when

> **when**: `string` \| `null`
