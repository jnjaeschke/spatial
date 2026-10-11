[**spatial**](../../README.md)

***

[spatial](../../README.md) / [plugin-api](../README.md) / plainText

# Function: plainText()

> **plainText**(`markdown`, `max?`): `string`

Markdown as one line of plain text: fences, block markers, emphasis, escapes and link targets removed, lines joined by spaces; longer than `max` it is cut at a word boundary with `…`.

## Parameters

### markdown

`string`

### max?

`number` = `Infinity`

## Returns

`string`
