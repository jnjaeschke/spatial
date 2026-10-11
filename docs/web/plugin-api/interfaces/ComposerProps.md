[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / ComposerProps

# Interface: ComposerProps

## Properties

### autoFocus?

> `optional` **autoFocus?**: `boolean`

***

### canSubmit

> **canSubmit**: `boolean`

***

### className?

> `optional` **className?**: `string`

***

### label

> **label**: `string`

***

### placeholder?

> `optional` **placeholder?**: `string`

***

### rows?

> `optional` **rows?**: `number`

***

### textareaRef?

> `optional` **textareaRef?**: `Ref`\<`HTMLTextAreaElement`\>

***

### value

> **value**: `string`

## Methods

### onChange()

> **onChange**(`value`): `void`

#### Parameters

##### value

`string`

#### Returns

`void`

***

### onKeyDown()?

> `optional` **onKeyDown**(`event`): `void`

Runs first; calling preventDefault skips the composer's own handling.

#### Parameters

##### event

`KeyboardEvent`\<`HTMLTextAreaElement`\>

#### Returns

`void`

***

### onSubmit()

> **onSubmit**(): `void`

Called on Enter when `canSubmit`.

#### Returns

`void`
