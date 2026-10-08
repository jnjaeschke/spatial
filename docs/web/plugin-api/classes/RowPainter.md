[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / RowPainter

# Class: RowPainter

Owns the ranges of one code view, keyed by row. `update` replaces only the rows whose text node,
text or segments changed, so untouched rows keep their Range objects. `dispose` removes everything,
keeping the shared highlights bounded to mounted views.

## Constructors

### Constructor

> **new RowPainter**(): `RowPainter`

#### Returns

`RowPainter`

## Methods

### dispose()

> **dispose**(): `void`

#### Returns

`void`

***

### update()

> **update**(`cells`, `segments`): `void`

`cells[i]` is the code cell of row i; `segments` come from `rowSegments`.

#### Parameters

##### cells

(`Element` \| `null`)[]

##### segments

[`Segment`](../interfaces/Segment.md)[]

#### Returns

`void`
