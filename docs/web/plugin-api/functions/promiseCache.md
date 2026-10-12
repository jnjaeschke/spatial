[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / promiseCache

# Function: promiseCache()

> **promiseCache**\<`T`\>(): (`key`, `load`) => `Promise`\<`T`\>

A loader that shares one `load()` promise per key while the page lives; a rejected one is dropped so the next call retries.

## Type Parameters

### T

`T`

## Returns

(`key`, `load`) => `Promise`\<`T`\>
