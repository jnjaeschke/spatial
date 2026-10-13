[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / CodeLinks

# Interface: CodeLinks

Links from code to the repository's browsable source, offered by a plugin's session provider.

## Properties

### label

> **label**: `string`

Text of a hunk's file link.

***

### title

> **title**: `string`

Tooltip of the links.

## Methods

### fileUrl()

> **fileUrl**(`path`, `line?`, `side?`): `string` \| `null`

A link to `path` (at `line`) on the given diff side; null when that side has no link. `side` defaults to `"old"`.

#### Parameters

##### path

`string`

##### line?

`number`

##### side?

`"new"` \| `"old"`

#### Returns

`string` \| `null`

***

### request()

> **request**(`tokens`): `void`

Asks for the links of unresolved tokens.

#### Parameters

##### tokens

`string`[]

#### Returns

`void`

***

### tokenUrl()

> **tokenUrl**(`token`): `string` \| `null`

The resolved link of a code token; null while it is pending and when it has none.

#### Parameters

##### token

`string`

#### Returns

`string` \| `null`
