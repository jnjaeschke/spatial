[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/brace-scan](../README.md) / functionsIn

# Function: functionsIn()

> **functionsIn**(`lines`): [`ScannedFunction`](../interfaces/ScannedFunction.md)[]

The function definitions of C-like source: every `{` whose preceding text (since the last `;`, `{` or `}`) names something followed by
`(`, except control statements, lambdas, and namespace, class, struct, union, enum and initializer braces. A heuristic: raw strings and
macros that unbalance braces are not handled.

## Parameters

### lines

`string`[]

## Returns

[`ScannedFunction`](../interfaces/ScannedFunction.md)[]
