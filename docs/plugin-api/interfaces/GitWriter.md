[**spatial-ide**](../../README.md)

***

[spatial-ide](../../README.md) / [plugin-api](../README.md) / GitWriter

# Interface: GitWriter

Object-database writes for remote review. Not a `GitCapability`: tasks never get it.

## Methods

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
