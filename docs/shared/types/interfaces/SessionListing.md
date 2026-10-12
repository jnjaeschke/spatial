[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / SessionListing

# Interface: SessionListing

A session as the session lists show it, with the time of its last activity.

## Extends

- [`Session`](Session.md)

## Properties

### createdAt

> **createdAt**: `string`

#### Inherited from

[`Session`](Session.md).[`createdAt`](Session.md#createdat)

***

### id

> **id**: `string`

#### Inherited from

[`Session`](Session.md).[`id`](Session.md#id)

***

### lastActive

> **lastActive**: `string`

***

### repoDir

> **repoDir**: `string`

Repo identity: absolute, symlink-resolved `git rev-parse --git-common-dir`, shared by all worktrees of a repo.

#### Inherited from

[`Session`](Session.md).[`repoDir`](Session.md#repodir)

***

### title

> **title**: `string`

#### Inherited from

[`Session`](Session.md).[`title`](Session.md#title)

***

### workflow

> **workflow**: `string` \| `null`

The workflow the session runs; the start box creates sessions with it set, null only for sessions made without one.

#### Inherited from

[`Session`](Session.md).[`workflow`](Session.md#workflow)

***

### worktree

> **worktree**: `string`

Absolute toplevel of the git worktree the session runs in.

#### Inherited from

[`Session`](Session.md).[`worktree`](Session.md#worktree)
