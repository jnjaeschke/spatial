[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/types](../README.md) / DecisionOption

# Interface: DecisionOption

One choice of a `Decision`. `takesText`: the user may add text; `requiresText`: the text is mandatory; `textPattern`: source of a regular expression the text must match; `defaultText`: text the UI prefills; `takesModel`: the answer carries the LLM selection to use for the work that follows (`chosen.llm`).

## Properties

### defaultText?

> `optional` **defaultText?**: `string`

***

### id

> **id**: `string`

***

### label

> **label**: `string`

***

### requiresText?

> `optional` **requiresText?**: `boolean`

***

### takesModel?

> `optional` **takesModel?**: `boolean`

***

### takesText?

> `optional` **takesText?**: `boolean`

***

### textPattern?

> `optional` **textPattern?**: `string`
