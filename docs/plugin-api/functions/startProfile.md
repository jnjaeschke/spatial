[**spatial**](../../README.md)

***

[spatial](../../README.md) / [plugin-api](../README.md) / startProfile

# Function: startProfile()

> **startProfile**(`profiles`, `view`): [`RepoProfile`](../../runtime/plugins/interfaces/RepoProfile.md) \| `null`

The profile named by the session's latest `WorkflowStart`; null when the session has none.

## Parameters

### profiles

`ReadonlyMap`\<`string`, [`RepoProfile`](../../runtime/plugins/interfaces/RepoProfile.md)\>

### view

[`SessionView`](../../runtime/render-ref/interfaces/SessionView.md)

## Returns

[`RepoProfile`](../../runtime/plugins/interfaces/RepoProfile.md) \| `null`
