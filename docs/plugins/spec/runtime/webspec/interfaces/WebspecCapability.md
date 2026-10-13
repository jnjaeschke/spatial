[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/runtime/webspec](../README.md) / WebspecCapability

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

### effectPaths()

> **effectPaths**(`ref`, `effectId`, `signal`): `Promise`\<[`SpecEffectPaths`](../../../shared/types/interfaces/SpecEffectPaths.md)\>

The effects of `ref` with their witness paths: of one effect, or of all of them when `effectId` is null.

#### Parameters

##### ref

`string`

##### effectId

`string` \| `null`

##### signal

`AbortSignal`

#### Returns

`Promise`\<[`SpecEffectPaths`](../../../shared/types/interfaces/SpecEffectPaths.md)\>

***

### idl()

> **idl**(`query`, `signal`): `Promise`\<[`SpecIdlMember`](../../../shared/types/interfaces/SpecIdlMember.md)[]\>

IDL members matching a query, `SPEC#anchor` or URL (`webspec-index idl`); empty when the section is no IDL member.

#### Parameters

##### query

`string`

##### signal

`AbortSignal`

#### Returns

`Promise`\<[`SpecIdlMember`](../../../shared/types/interfaces/SpecIdlMember.md)[]\>

***

### lookup()

> **lookup**(`request`, `signal`): `Promise`\<`string`\>

Text output of a read-only lookup for LLM tools: markdown for `query` and `state`, JSON for `refs` and `effects` (compact), a mermaid chart for `flow`.

#### Parameters

##### request

[`WebspecLookup`](../type-aliases/WebspecLookup.md)

##### signal

`AbortSignal`

#### Returns

`Promise`\<`string`\>

***

### query()

> **query**(`ref`, `signal`): `Promise`\<\{ `found`: `true`; `section`: [`SpecSection`](../../../shared/types/interfaces/SpecSection.md); \} \| \{ `found`: `false`; `reason`: `string`; \}\>

One section (`webspec-index query <ref>`); `ref` is a `SPEC#anchor` or a spec URL.

#### Parameters

##### ref

`string`

##### signal

`AbortSignal`

#### Returns

`Promise`\<\{ `found`: `true`; `section`: [`SpecSection`](../../../shared/types/interfaces/SpecSection.md); \} \| \{ `found`: `false`; `reason`: `string`; \}\>

***

### refs()

> **refs**(`ref`, `signal`): `Promise`\<\{ `incoming`: `string`[]; `outgoing`: `string`[]; \}\>

Sections whose steps link `ref` (`incoming`) and that `ref`'s steps link (`outgoing`), as `SPEC#anchor` refs without repeats (`webspec-index refs <ref> --kind step`).

#### Parameters

##### ref

`string`

##### signal

`AbortSignal`

#### Returns

`Promise`\<\{ `incoming`: `string`[]; `outgoing`: `string`[]; \}\>

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

***

### search()

> **search**(`phrase`, `signal`): `Promise`\<[`SpecSearchResult`](../../../shared/types/interfaces/SpecSearchResult.md)[]\>

Sections matching a phrase, best first.

#### Parameters

##### phrase

`string`

##### signal

`AbortSignal`

#### Returns

`Promise`\<[`SpecSearchResult`](../../../shared/types/interfaces/SpecSearchResult.md)[]\>
