[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / useHoverCard

# Function: useHoverCard()

> **useHoverCard**\<`T`\>(`pinned?`): `object`

The open card of a hover target: `show` opens it after a delay, `hide` closes it after a shorter one, and `keep` cancels either
(the card's `onEnter` is `keep`, its `onLeave` is `hide`). `set` changes it at once. `hide` leaves open a card that `pinned` holds.
The functions are stable across renders.

## Type Parameters

### T

`T`

## Parameters

### pinned?

(`card`) => `boolean`

## Returns

`object`

### open

> **open**: `T` \| `null`

### hide()

> **hide**(): `void`

#### Returns

`void`

### keep()

> **keep**(): `void`

#### Returns

`void`

### set()

> **set**(`card`): `void`

#### Parameters

##### card

`T` \| `null`

#### Returns

`void`

### show()

> **show**(`card`): `void`

#### Parameters

##### card

`SetStateAction`\<`T` \| `null`\>

#### Returns

`void`
