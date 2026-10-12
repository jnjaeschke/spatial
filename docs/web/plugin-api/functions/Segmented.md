[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / Segmented

# Function: Segmented()

> **Segmented**\<`T`\>(`__namedParameters`): `Element`

One choice out of a few, as pressed buttons in a group. An option's `title` is its accessible name and tooltip; with a `description` instead, its text label is the name and the description the tooltip.

## Type Parameters

### T

`T` *extends* `string`

## Parameters

### \_\_namedParameters

#### className?

`string`

#### label

`string`

#### options

(\{ `label`: `ReactNode`; `title?`: `string`; `value`: `T`; \} \| \{ `description`: `string`; `label`: `string`; `value`: `T`; \})[]

#### value

`T`

#### onChange

## Returns

`Element`
