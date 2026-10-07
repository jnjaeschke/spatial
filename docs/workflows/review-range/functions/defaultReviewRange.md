[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [workflows/review-range](../README.md) / defaultReviewRange

# Function: defaultReviewRange()

> **defaultReviewRange**(`repo`, `git`): `Promise`\<\{ `base`: `string`; `head`: `string`; \}\>

The range `/review` means without refs: the uncommitted changes of the session's worktree when there are any, else the latest commit. Dirty: snapshots the worktree (objects plus `refs/spatial/worktree/<sha12>` only) and returns `{ base: <HEAD at snapshot time>, head: <that ref> }`. Clean (also when the snapshot tree equals HEAD's): `{ base: "HEAD~1", head: "HEAD" }`.

## Parameters

### repo

`string`

### git

[`GitCapability`](../../../runtime/tasks/interfaces/GitCapability.md)

## Returns

`Promise`\<\{ `base`: `string`; `head`: `string`; \}\>
