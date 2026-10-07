[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [workflows/review-range](../README.md) / defaultReviewRange

# Function: defaultReviewRange()

> **defaultReviewRange**(`repo`, `git`): `Promise`\<\{ `base`: `string`; `head`: `string`; \}\>

The range `/review` means without refs: uncommitted changes when present; otherwise commits since the nearest fork point from a local or remote-tracking main/master (a stale local main must not pull in upstream history), falling back to the latest commit on the default branch. Dirty worktrees are snapshotted under `refs/spatial/worktree/<sha12>`.

## Parameters

### repo

`string`

### git

[`GitCapability`](../../../runtime/tasks/interfaces/GitCapability.md)

## Returns

`Promise`\<\{ `base`: `string`; `head`: `string`; \}\>
