[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / Session

# Interface: Session

The user's durable unit of work. Grouped by repo (`repoDir`); runs in one worktree of it.

## Extended by

- [`SessionListing`](SessionListing.md)

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

> **workflow**: `string` \| `null`

The workflow the session runs; the start box creates sessions with it set, null only for sessions made without one.

***

### worktree

> **worktree**: `string`

Absolute toplevel of the git worktree the session runs in.
