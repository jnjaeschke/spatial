[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/review/api](../README.md) / roundStack

# Function: roundStack()

> **roundStack**(`rounds`, `k`, `order`): [`RoundDiff`](../interfaces/RoundDiff.md)[]

The stack as of round `k`, in `order` (revision ids, root first): each revision's diff in that round, else its newest from an earlier round; revisions without a diff yet are left out.

## Parameters

### rounds

[`RoundDiff`](../interfaces/RoundDiff.md)[][]

### k

`number`

### order

`number`[]

## Returns

[`RoundDiff`](../interfaces/RoundDiff.md)[]
