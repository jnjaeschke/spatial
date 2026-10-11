[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / sequenceLayout

# Function: sequenceLayout()

> **sequenceLayout**(`lanes`, `steps`): `object`

Grid placement of `steps` over `lanes` (lane ids): a phase label row before the first step of each named phase; a self step also spans the neighbouring lane, so its text is not squeezed into one column, and its loop stays on its own lane.

## Parameters

### lanes

`string`[]

### steps

`object`[]

## Returns

`object`

### cells

> **cells**: `SequenceCell`[]

### rowCount

> **rowCount**: `number`
