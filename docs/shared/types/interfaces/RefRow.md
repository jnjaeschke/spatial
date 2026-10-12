[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / RefRow

# Interface: RefRow

A ref; `sha` is the commit it points at (tags peeled). `worktree` is set for a local branch checked out in a work tree.

## Properties

### kind

> **kind**: `"head"` \| `"remote"` \| `"tag"` \| `"HEAD"`

***

### name

> **name**: `string`

***

### sha

> **sha**: `string`

***

### upstream?

> `optional` **upstream?**: `string`

***

### worktree?

> `optional` **worktree?**: `string`
