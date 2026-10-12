[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/brace-scan](../README.md) / declarationAt

# Function: declarationAt()

> **declarationAt**(`lines`, `line`): \{ `name`: `string`; `owner`: `string` \| `null`; `parameters`: `string`; \} \| `null`

The function declared at `line` (1-based) of C-like source, read through its `;`: a declaration without a body. Its name, the class or
struct it is declared in (null outside one) and its parameter list as `functionsIn` writes it, default values dropped (definitions
repeat no defaults). Null when `line` starts no such declaration.

## Parameters

### lines

`string`[]

### line

`number`

## Returns

\{ `name`: `string`; `owner`: `string` \| `null`; `parameters`: `string`; \} \| `null`
