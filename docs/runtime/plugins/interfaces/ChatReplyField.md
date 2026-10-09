[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/plugins](../README.md) / ChatReplyField

# Interface: ChatReplyField

A field a plugin adds to the structured chat reply.

## Properties

### label

> **label**: `string`

Label shown in the reply error message.

***

### name

> **name**: `string`

***

### prompt

> **prompt**: `string`

Section appended to the chat system prompt.

***

### schema

> **schema**: `object`

JSON schema for the non-null value. Core makes it required and nullable.

## Methods

### accept()

> **accept**(`ctx`, `value`): `Promise`\<\{ `artifacts`: `object`[]; `ok`: `true`; `run?`: \{ `input`: `unknown`; `phase`: `string`; \}; \} \| \{ `error`: `string`; `ok`: `false`; \}\>

Validates the value and returns artifacts to store and link to the reply, and optionally a phase for the runtime to start after the turn (one per reply).

#### Parameters

##### ctx

[`TaskContext`](../../tasks/interfaces/TaskContext.md)

##### value

`unknown`

#### Returns

`Promise`\<\{ `artifacts`: `object`[]; `ok`: `true`; `run?`: \{ `input`: `unknown`; `phase`: `string`; \}; \} \| \{ `error`: `string`; `ok`: `false`; \}\>
