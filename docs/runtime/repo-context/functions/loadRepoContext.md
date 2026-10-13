[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/repo-context](../README.md) / loadRepoContext

# Function: loadRepoContext()

> **loadRepoContext**(`repoRoot`, `denied?`): [`RepoContext`](../interfaces/RepoContext.md)

Loads MCP servers, skills, and instructions from a repository root.
Servers named in `denied` are only requestable. Malformed files and unresolved instruction includes throw instead of being skipped.

## Parameters

### repoRoot

`string`

### denied?

readonly `string`[] = `[]`

## Returns

[`RepoContext`](../interfaces/RepoContext.md)
