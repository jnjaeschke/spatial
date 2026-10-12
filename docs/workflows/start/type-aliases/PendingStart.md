[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [workflows/start](../README.md) / PendingStart

# Type Alias: PendingStart

> **PendingStart** = `object` & \{ `prompt`: `string`; `round`: `number`; \} \| \{ `options`: [`PrecheckQuestion`](../../../runtime/plugins/interfaces/PrecheckQuestion.md)\<`unknown`\>\[`"options"`\]; `selection?`: [`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md); `start`: `Chosen`; \}

A start waiting in the start box: the selector's clarifying question, or the chosen workflow's precheck.

## Type Declaration

### base

> **base**: `StartBase`

### question

> **question**: `string`
