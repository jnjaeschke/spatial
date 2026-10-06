[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/types](../README.md) / Session

# Interface: Session

The user's durable unit of work. Grouped by repo (`repoDir`); runs in one worktree of it.

## Properties

### createdAt

> **createdAt**: `string`

***

### id

> **id**: `string`

***

### repoDir

> **repoDir**: `string`

Repo identity: absolute, symlink-resolved `git rev-parse --git-common-dir`, shared by all worktrees of a repo.

***

### title

> **title**: `string`

***

### workflow

> **workflow**: [`WorkflowId`](../type-aliases/WorkflowId.md) \| `null`

The workflow the session runs; null until the start request is interpreted.

***

### worktree

> **worktree**: `string`

Absolute toplevel of the git worktree the session runs in.
