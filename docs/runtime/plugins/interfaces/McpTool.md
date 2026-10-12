[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/plugins](../README.md) / McpTool

# Interface: McpTool\<S\>

A read-only tool a plugin adds to the session MCP server (`spatial`), which LLM tasks reach through `ctx.sessionMcp`. `input` is the zod shape of its arguments; `run` returns the text answer and throws for an error answer.

## Type Parameters

### S

`S` *extends* `z.ZodRawShape` = `z.ZodRawShape`

## Properties

### description

> **description**: `string`

***

### input

> **input**: `S`

***

### name

> **name**: `string`

## Methods

### run()

> **run**(`ctx`, `input`): `Promise`\<`string`\>

#### Parameters

##### ctx

[`McpToolContext`](McpToolContext.md)

##### input

`$InferObjectOutput`\<`S`\>

#### Returns

`Promise`\<`string`\>
