[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/post-plan](../README.md) / postTarget

# Function: postTarget()

> **postTarget**(`diff`, `lines`): [`PostTarget`](../interfaces/PostTarget.md) \| \{ `skip`: `string`; \}

Maps a comment range on the squashed diff to the commit that owns it and that commit's own line numbers, or explains why not.

## Parameters

### diff

[`DiffData`](../../types/interfaces/DiffData.md)

### lines

#### end

`number`

#### path

`string`

#### side

`"new"` \| `"old"`

#### start

`number`

## Returns

[`PostTarget`](../interfaces/PostTarget.md) \| \{ `skip`: `string`; \}
