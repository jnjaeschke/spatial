[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/review/shared/types](../README.md) / IntroducedSymbolsData

# Interface: IntroducedSymbolsData

Data of an `IntroducedSymbols` artifact: identifiers the diff adds that occur nowhere in the base tree, by name, with the added line that defines them.

## Properties

### diffId

> **diffId**: `string`

***

### symbols

> **symbols**: `Record`\<`string`, \{ `commit`: `number`; `hunkId`: `string`; `line`: `number`; `path`: `string`; \}\>
