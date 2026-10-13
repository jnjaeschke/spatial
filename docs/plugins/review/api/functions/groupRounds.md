[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/review/api](../README.md) / groupRounds

# Function: groupRounds()

> **groupRounds**(`diffs`): [`RoundDiff`](../interfaces/RoundDiff.md)[][]

Groups a stack's diffs into review rounds, oldest first: a diff joins the current round when it is within the window of the round's first diff and the round has no diff of its revision yet.

## Parameters

### diffs

[`RoundDiff`](../interfaces/RoundDiff.md)[]

## Returns

[`RoundDiff`](../interfaces/RoundDiff.md)[][]
