[**spatial**](../../README.md)

***

[spatial](../../README.md) / [plugin-api](../README.md) / resolveRepo

# Function: resolveRepo()

> **resolveRepo**(`path`): `Promise`\<\{ `repoDir`: `string`; `worktree`: `string`; \}\>

Worktree toplevel and repo identity of `path`. Throws `Not a git repository` outside a work tree (bare repos included).

## Parameters

### path

`string`

## Returns

`Promise`\<\{ `repoDir`: `string`; `worktree`: `string`; \}\>
