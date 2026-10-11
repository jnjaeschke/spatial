[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/structured](../README.md) / schemaErrors

# Function: schemaErrors()

> **schemaErrors**(`schema`, `value`, `path?`): `string`[]

Where `value` breaks `schema`: types (`integer` included), `enum`, `required`, nested `properties` and `items`, `anyOf`, numeric and length bounds. `additionalProperties` is not checked.

## Parameters

### schema

[`JsonSchema`](../interfaces/JsonSchema.md)

### value

`unknown`

### path?

`string` = `"$"`

## Returns

`string`[]
