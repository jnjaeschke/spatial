[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / SequenceArrow

# Interface: SequenceArrow

One arrow of a sequence diagram from lane `from` to lane `to` (equal for a self step); `label` renders above the arrow; with `onClick` the step is a button.

## Properties

### data?

> `optional` **data?**: `Record`\<`` `data-${string}` ``, `string`\>

***

### from

> **from**: `string`

***

### label

> **label**: `ReactNode`

***

### phase?

> `optional` **phase?**: `string` \| `null`

***

### title?

> `optional` **title?**: `string`

***

### to

> **to**: `string`

## Methods

### onClick()?

> `optional` **onClick**(): `void`

#### Returns

`void`
