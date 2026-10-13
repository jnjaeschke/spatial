[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/runtime/services](../README.md) / specServicesFromEnv

# Function: specServicesFromEnv()

> **specServicesFromEnv**(`env`): [`SpecServices`](../interfaces/SpecServices.md)

Builds the services with tool binaries from `SPATIAL_WEBSPEC_BIN`, `SPATIAL_SEARCHFOX_BIN` and `SPATIAL_CHROMIUM_SEARCH_BIN` (the tools' names on `PATH` when unset). Gecko searches over searchfox, WebKit over searchfox's `wubkat` repository, Blink over chromium-search.

## Parameters

### env

`Readonly`\<`Record`\<`string`, `string` \| `undefined`\>\>

## Returns

[`SpecServices`](../interfaces/SpecServices.md)
