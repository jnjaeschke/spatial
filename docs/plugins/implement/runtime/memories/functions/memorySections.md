[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/runtime/memories](../README.md) / memorySections

# Function: memorySections()

> **memorySections**(`ctx`, `phase`, `kind`): `string`[]

Prompt sections for the memories relevant to `phase` and `kind`; when there are any it also records them as a `UsedMemories` artifact of the task's epoch.

## Parameters

### ctx

`Pick`\<[`TaskContext`](../../../../../runtime/tasks/interfaces/TaskContext.md), `"knowledge"` \| `"repoDir"` \| `"sessionId"` \| `"artifacts"`\>

### phase

`string`

### kind

`string` \| `null`

## Returns

`string`[]
