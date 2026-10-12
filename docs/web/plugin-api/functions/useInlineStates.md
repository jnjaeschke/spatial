[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / useInlineStates

# Function: useInlineStates()

> **useInlineStates**(`sessionId`): `object`

Per-session state of inline items and the canvas-wide compact toggle, kept in localStorage. Setting an item's state ends compact.

## Parameters

### sessionId

`string`

## Returns

`object`

### compact

> **compact**: `boolean`

### move

> **move**: (`from`, `to`) => `void`

#### Parameters

##### from

`string`

##### to

`string`

#### Returns

`void`

### set

> **set**: (`id`, `state`) => `void`

#### Parameters

##### id

`string`

##### state

[`InlineState`](../type-aliases/InlineState.md)

#### Returns

`void`

### setCompact

> **setCompact**: (`value`) => `void`

#### Parameters

##### value

`boolean`

#### Returns

`void`

### state

> **state**: (`id`) => [`InlineState`](../type-aliases/InlineState.md)

#### Parameters

##### id

`string`

#### Returns

[`InlineState`](../type-aliases/InlineState.md)
