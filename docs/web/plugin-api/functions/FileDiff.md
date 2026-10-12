[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / FileDiff

# Function: FileDiff()

> **FileDiff**(`__namedParameters`): `Element`

One file's diff without a session: its hunks in one table, unchanged stretches as gap rows that load the file once (`loadLines`, the new side) and open in place.

## Parameters

### \_\_namedParameters

#### file

[`DiffFile`](../../../shared/types/interfaces/DiffFile.md)

#### loadLines?

() => `Promise`\<`string`[]\>

## Returns

`Element`
