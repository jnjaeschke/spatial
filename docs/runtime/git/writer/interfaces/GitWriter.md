[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/git/writer](../README.md) / GitWriter

# Interface: GitWriter

Object-database writes for remote review. Not a `GitCapability`: tasks never get it.

## Methods

### branchExists()

> **branchExists**(`name`): `Promise`\<`boolean`\>

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`boolean`\>

***

### changedFiles()

> **changedFiles**(): `Promise`\<`number`\>

Number of paths with staged, unstaged or untracked (non-ignored) changes.

#### Returns

`Promise`\<`number`\>

***

### changedPaths()

> **changedPaths**(): `Promise`\<`string`[]\>

Paths with staged, unstaged or untracked changes (renames report the new path).

#### Returns

`Promise`\<`string`[]\>

***

### commitAll()

> **commitAll**(`message`): `Promise`\<`string`\>

Stages everything and commits it with `message`; returns the new commit's sha.

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`string`\>

***

### commitPatch()

> **commitPatch**(`parent`, `rawDiff`, `message`, `identity`): `Promise`\<`string`\>

Applies `rawDiff` onto the tree of `parent` in a temporary index and commits the result on top of `parent`. Writes only objects: the work tree, the index, HEAD and all refs are untouched. Deterministic for equal inputs. Rejects when the patch does not apply. Returns the new commit sha.

#### Parameters

##### parent

`string`

##### rawDiff

`string`

##### message

`string`

##### identity

[`PatchIdentity`](PatchIdentity.md)

#### Returns

`Promise`\<`string`\>

***

### createBranch()

> **createBranch**(`name`, `base`): `Promise`\<`void`\>

`git switch -c <name> <base>`; uncommitted changes move along.

#### Parameters

##### name

`string`

##### base

`string`

#### Returns

`Promise`\<`void`\>

***

### currentBranch()

> **currentBranch**(): `Promise`\<`string` \| `null`\>

Current branch name; null on a detached HEAD.

#### Returns

`Promise`\<`string` \| `null`\>

***

### defaultBase()

> **defaultBase**(): `Promise`\<\{ `ref`: `string`; `sha`: `string`; \}\>

The commit new work starts from. With an `origin` remote: fetches it and resolves the target of `origin/HEAD`, or of `git ls-remote --symref origin HEAD` when that is unset. Without: the local `main`, else `master`. Rejects when none exists.

#### Returns

`Promise`\<\{ `ref`: `string`; `sha`: `string`; \}\>

***

### fetch()

> **fetch**(`remote`): `Promise`\<`void`\>

`git fetch <remote>`; rejects with git's message.

#### Parameters

##### remote

`string`

#### Returns

`Promise`\<`void`\>

***

### fixup()

> **fixup**(`target`, `base`): `Promise`\<`string`\>

Stages everything, commits it as `--fixup=<target>` and autosquashes `base..HEAD`. On a conflict it aborts the rebase, drops the fixup commit (the edits stay in the work tree) and rejects.

#### Parameters

##### target

`string`

##### base

`string`

#### Returns

`Promise`\<`string`\>

***

### snapshotWorktree()

> **snapshotWorktree**(`identity`): `Promise`\<`string` \| `null`\>

Commits the work tree as it is now (staged, unstaged and untracked non-ignored changes, deletions included) on top of HEAD, built in a temporary index copied from the real one. Writes only objects: work tree, real index, HEAD and all refs are untouched. Returns the commit sha, or null when the resulting tree equals HEAD's tree. Rejects when HEAD does not exist.

#### Parameters

##### identity

[`PatchIdentity`](PatchIdentity.md)

#### Returns

`Promise`\<`string` \| `null`\>

***

### updateRef()

> **updateRef**(`ref`, `sha`): `Promise`\<`void`\>

Points `ref` at `sha`. Rejects unless `ref` starts with `refs/spatial/`.

#### Parameters

##### ref

`string`

##### sha

`string`

#### Returns

`Promise`\<`void`\>
