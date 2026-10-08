[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / Draft

# Interface: Draft

A chat box the user opened but whose first turn has not produced a thread yet.

## Extends

- [`SelectionData`](../type-aliases/SelectionData.md)

## Properties

### anchor

> **anchor**: `string`

***

### aside?

> `optional` **aside?**: `boolean`

***

### id

> **id**: `string`

***

### lines?

> `optional` **lines?**: `object`

#### end

> **end**: `number`

#### path

> **path**: `string`

#### side

> **side**: `"new"` \| `"old"`

#### start

> **start**: `number`

#### Inherited from

[`ChatThreadData`](../../../shared/types/interfaces/ChatThreadData.md).[`lines`](../../../shared/types/interfaces/ChatThreadData.md#lines)

***

### quote?

> `optional` **quote?**: `string`

#### Inherited from

[`ChatThreadData`](../../../shared/types/interfaces/ChatThreadData.md).[`quote`](../../../shared/types/interfaces/ChatThreadData.md#quote)

***

### taskId?

> `optional` **taskId?**: `string`
