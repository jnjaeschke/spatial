[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/tasks](../README.md) / WebspecCapability

# Interface: WebspecCapability

## Properties

### effect

> `readonly` **effect**: `"read-only"`

## Methods

### analyze()

> **analyze**(`name`, `text`, `signal`): `Promise`\<[`StepCommentCheck`](StepCommentCheck.md)[]\>

Step comments of a source file checked against the spec algorithms it links (`webspec-index analyze`, as its LSP does). `name` is the file's base name.

#### Parameters

##### name

`string`

##### text

`string`

##### signal

`AbortSignal`

#### Returns

`Promise`\<[`StepCommentCheck`](StepCommentCheck.md)[]\>

***

### resolve()

> **resolve**(`url`, `signal`): `Promise`\<\{ `found`: `true`; `spec`: [`ResolvedSpec`](../../../shared/types/interfaces/ResolvedSpec.md); \} \| \{ `found`: `false`; `reason`: `string`; \}\>

#### Parameters

##### url

`string`

##### signal

`AbortSignal`

#### Returns

`Promise`\<\{ `found`: `true`; `spec`: [`ResolvedSpec`](../../../shared/types/interfaces/ResolvedSpec.md); \} \| \{ `found`: `false`; `reason`: `string`; \}\>
