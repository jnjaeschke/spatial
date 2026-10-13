[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/repo-context](../README.md) / loadRepoContext

# Function: loadRepoContext()

> **loadRepoContext**(`repoRoot`): [`RepoContext`](../interfaces/RepoContext.md)

Loads MCP servers, skills, and instructions from a repository root.
Only `http` servers are active; `stdio` servers run commands from the repository, so they are only requestable and run once the user enables them for a chat thread.
Malformed files, unsafe or reserved server names, and unresolved instruction includes throw instead of being skipped.

## Parameters

### repoRoot

`string`

## Returns

[`RepoContext`](../interfaces/RepoContext.md)
