[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / FilePanel

# Function: FilePanel()

> **FilePanel**(`__namedParameters`): `Element`

`onJump` reveals a hunk row on the canvas. Previous / Next change (or p / n in the panel) step through the file's changes.

## Parameters

### \_\_namedParameters

#### diff

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<[`DiffData`](../../../shared/types/interfaces/DiffData.md)\>

#### onBack?

() => `void`

#### onClose

() => `void`

#### onJump

(`row`) => `void`

#### open

[`FileViewRequest`](../interfaces/FileViewRequest.md)

#### sessionId

`string`

## Returns

`Element`
