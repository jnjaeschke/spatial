[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/tasks](../README.md) / GitCapability

# Interface: GitCapability

Read-only git access bound to one session's repo.

## Properties

### effect

> `readonly` **effect**: `"read-only"`

## Methods

### blame()

> **blame**(`baseSha`, `rev`, `file`, `direction`): `Promise`\<[`BlameEntry`](BlameEntry.md)[]\>

`git blame --porcelain`; line is in `rev` for forward, in `base` for reverse.

#### Parameters

##### baseSha

`string`

##### rev

`string`

##### file

`string`

##### direction

`"reverse"` \| `"forward"`

#### Returns

`Promise`\<[`BlameEntry`](BlameEntry.md)[]\>

***

### branches()

> **branches**(): `Promise`\<[`LocalBranch`](LocalBranch.md)[]\>

Local branches: the checked-out one first, then by newest tip commit.

#### Returns

`Promise`\<[`LocalBranch`](LocalBranch.md)[]\>

***

### diff()

> **diff**(`baseSha`, `headSha`): `Promise`\<`string`\>

Raw `git diff` text for `base..head`.

#### Parameters

##### baseSha

`string`

##### headSha

`string`

#### Returns

`Promise`\<`string`\>

***

### isAncestor()

> **isAncestor**(`ancestor`, `descendant`): `Promise`\<`boolean`\>

#### Parameters

##### ancestor

`string`

##### descendant

`string`

#### Returns

`Promise`\<`boolean`\>

***

### isDirty()

> **isDirty**(): `Promise`\<`boolean`\>

True when `git status` reports staged, unstaged or untracked (non-ignored) changes. Never writes: runs with `--no-optional-locks`, so the index file is not refreshed.

#### Returns

`Promise`\<`boolean`\>

***

### log()

> **log**(`baseSha`, `headSha`): `Promise`\<[`Commit`](../../../shared/types/interfaces/Commit.md)[]\>

Commits in `base..head`, oldest first.

#### Parameters

##### baseSha

`string`

##### headSha

`string`

#### Returns

`Promise`\<[`Commit`](../../../shared/types/interfaces/Commit.md)[]\>

***

### mainlineRefs()

> **mainlineRefs**(): `Promise`\<`string`[]\>

Local and remote-tracking `main`/`master` branches (full ref names).

#### Returns

`Promise`\<`string`[]\>

***

### mergeBase()

> **mergeBase**(`a`, `b`): `Promise`\<`string` \| `null`\>

#### Parameters

##### a

`string`

##### b

`string`

#### Returns

`Promise`\<`string` \| `null`\>

***

### patchIds()

> **patchIds**(`baseSha`, `headSha`): `Promise`\<`object`[]\>

`git patch-id --stable` of each commit in `base..head`, oldest first: equal for the same change on another base.

#### Parameters

##### baseSha

`string`

##### headSha

`string`

#### Returns

`Promise`\<`object`[]\>

***

### replay()

> **replay**(`oldBase`, `newBase`, `oldHead`): `Promise`\<\{ `conflicts`: `string`[]; `tree`: `string`; \}\>

Replays `oldBase..oldHead` onto `newBase` (`git merge-tree --write-tree`). `tree` is the resulting tree id; it contains conflict markers for `conflicts` (paths, possibly empty). Writes only unreachable objects.

#### Parameters

##### oldBase

`string`

##### newBase

`string`

##### oldHead

`string`

#### Returns

`Promise`\<\{ `conflicts`: `string`[]; `tree`: `string`; \}\>

***

### resolve()

> **resolve**(`rev`): `Promise`\<`string`\>

Resolves any revspec to a full commit SHA.

#### Parameters

##### rev

`string`

#### Returns

`Promise`\<`string`\>

***

### show()

> **show**(`sha`, `path`): `Promise`\<`string`\>

File content at a commit.

#### Parameters

##### sha

`string`

##### path

`string`

#### Returns

`Promise`\<`string`\>

***

### wordsAt()

> **wordsAt**(`rev`, `words`): `Promise`\<`Set`\<`string`\>\>

Which of `words` occur as whole words in some text file of the tree at `rev` (`git grep -w -F`, one call).

#### Parameters

##### rev

`string`

##### words

`string`[]

#### Returns

`Promise`\<`Set`\<`string`\>\>
