[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/tasks](../README.md) / GitCapability

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
