[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/scm/shared/lanes](../README.md) / layoutLanes

# Function: layoutLanes()

> **layoutLanes**(`state`, `page`): `object`

Lays out a topo-ordered page of commits, continuing from `state`; feeding pages one by one gives the same rows as one call over all of them.

## Parameters

### state

[`LaneState`](../interfaces/LaneState.md)

### page

`object`[]

## Returns

`object`

### rows

> **rows**: [`LaneRow`](../interfaces/LaneRow.md)[]

### state

> **state**: [`LaneState`](../interfaces/LaneState.md)
