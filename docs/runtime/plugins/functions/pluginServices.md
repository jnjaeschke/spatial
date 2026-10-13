[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/plugins](../README.md) / pluginServices

# Function: pluginServices()

> **pluginServices**(`plugins`, `env`, `overrides?`): `Readonly`\<`Record`\<`string`, `unknown`\>\>

The services of `plugins`: an override per plugin id wins over the plugin's own, built from `env`.

## Parameters

### plugins

[`Plugin`](../interfaces/Plugin.md)[]

### env

`Readonly`\<`Record`\<`string`, `string` \| `undefined`\>\>

### overrides?

`Record`\<`string`, `unknown`\> = `{}`

## Returns

`Readonly`\<`Record`\<`string`, `unknown`\>\>
