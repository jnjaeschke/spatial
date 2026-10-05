[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/tasks](../README.md) / GitCapability

# Interface: GitCapability

Read-only git access bound to one session's repo.

## Properties

### effect

> `readonly` **effect**: `"read-only"`

## Methods

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
