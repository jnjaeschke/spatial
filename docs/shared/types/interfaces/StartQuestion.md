[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / StartQuestion

# Interface: StartQuestion

A question the start box shows before a session exists: the workflow selector's (answered in text) or the chosen workflow's precheck (`options`; an option with `cancel` abandons the start). Answer with `POST /api/start` `{ question: id, answer }`, the answer being the text or the option's index.

## Properties

### id

> **id**: `string`

***

### options?

> `optional` **options?**: `object`[]

#### cancel?

> `optional` **cancel?**: `true`

#### label

> **label**: `string`

***

### question

> **question**: `string`
