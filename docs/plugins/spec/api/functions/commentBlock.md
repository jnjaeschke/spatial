[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/spec/api](../README.md) / commentBlock

# Function: commentBlock()

> **commentBlock**(`lines`, `line`, `commentLines`): `number`[]

The lines a Step comment on `line` describes: itself and following lines up to a blank line, the next Step comment, a line indented less than the comment, or 20 lines.

## Parameters

### lines

`string`[]

### line

`number`

### commentLines

`Set`\<`number`\>

## Returns

`number`[]
