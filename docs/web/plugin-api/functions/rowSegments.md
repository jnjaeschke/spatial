[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / rowSegments

# Function: rowSegments()

> **rowSegments**(`path`, `rows`): [`Segment`](../interfaces/Segment.md)[]

Segments over the diff rows: the new side (context and added rows) and the old side (context and
deleted rows) are each tokenized as source text; line-number gaps (between hunks) start a new fragment.

## Parameters

### path

`string`

### rows

[`CodeRow`](../interfaces/CodeRow.md)[]

## Returns

[`Segment`](../interfaces/Segment.md)[]
