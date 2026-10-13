[**spatial**](../../README.md)

***

[spatial](../../README.md) / [plugin-api](../README.md) / sessionProfile

# Function: sessionProfile()

> **sessionProfile**(`profiles`, `view`, `worktree`): `Promise`\<[`RepoProfile`](../../runtime/plugins/interfaces/RepoProfile.md)\>

The session's repo profile: the one its `WorkflowStart` names, else the one detected in `worktree` (sessions created without a workflow start).

## Parameters

### profiles

`ReadonlyMap`\<`string`, [`RepoProfile`](../../runtime/plugins/interfaces/RepoProfile.md)\>

### view

[`SessionView`](../../runtime/render-ref/interfaces/SessionView.md)

### worktree

`string`

## Returns

`Promise`\<[`RepoProfile`](../../runtime/plugins/interfaces/RepoProfile.md)\>
