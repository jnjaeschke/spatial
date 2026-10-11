[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / useAction

# Function: useAction()

> **useAction**(): `object`

Busy and error state of a user-triggered async action. `run` clears the error, sets busy, and records a rejection's message.

## Returns

`object`

### busy

> **busy**: `boolean`

### error

> **error**: `string` \| `null`

### clear()

> **clear**(): `void`

#### Returns

`void`

### fail()

> **fail**(`message`): `void`

#### Parameters

##### message

`string`

#### Returns

`void`

### run()

> **run**\<`T`\>(`action`): `Promise`\<`T` \| `undefined`\>

#### Type Parameters

##### T

`T`

#### Parameters

##### action

() => `Promise`\<`T`\>

#### Returns

`Promise`\<`T` \| `undefined`\>
