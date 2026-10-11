[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/diagram](../README.md) / diagramSchema

# Variable: diagramSchema

> `const` **diagramSchema**: `object`

JSON schema for a sequence diagram proposal with cited steps.

## Type Declaration

### additionalProperties

> **additionalProperties**: `boolean` = `false`

### properties

> **properties**: `object`

#### properties.before

> **before**: `object`

#### properties.before.anyOf

> **anyOf**: (\{ `items?`: `undefined`; `type`: `string`; \} \| \{ `items`: \{ `additionalProperties`: `boolean`; `properties`: \{ `call`: \{ `type`: `string`; \}; `cite`: \{ `additionalProperties`: `boolean`; `properties`: \{ `line`: \{ `minimum`: ...; `type`: ...; \}; `path`: \{ `type`: ...; \}; \}; `required`: `string`[]; `type`: `string`; \}; `from`: \{ `type`: `string`; \}; `guard`: \{ `type`: `string`[]; \}; `phase`: \{ `type`: `string`[]; \}; `status`: \{ `enum`: `string`[]; `type`: `string`; \}; `symbol`: \{ `type`: `string`; \}; `to`: \{ `type`: `string`; \}; `what`: \{ `type`: `string`; \}; `when`: \{ `type`: `string`[]; \}; \}; `required`: `string`[]; `type`: `string`; \}; `type`: `string`; \})[]

#### properties.commit

> **commit**: `object`

#### properties.commit.minimum

> **minimum**: `number` = `1`

#### properties.commit.type

> **type**: `string` = `"integer"`

#### properties.lanes

> **lanes**: `object`

#### properties.lanes.items

> **items**: `object`

#### properties.lanes.items.additionalProperties

> **additionalProperties**: `boolean` = `false`

#### properties.lanes.items.properties

> **properties**: `object`

#### properties.lanes.items.properties.id

> **id**: `object`

#### properties.lanes.items.properties.id.type

> **type**: `string` = `"string"`

#### properties.lanes.items.properties.label

> **label**: `object`

#### properties.lanes.items.properties.label.type

> **type**: `string` = `"string"`

#### properties.lanes.items.properties.note

> **note**: `object`

#### properties.lanes.items.properties.note.type

> **type**: `string`[]

#### properties.lanes.items.required

> **required**: `string`[]

#### properties.lanes.items.type

> **type**: `string` = `"object"`

#### properties.lanes.type

> **type**: `string` = `"array"`

#### properties.steps

> **steps**: `object`

#### properties.steps.items

> **items**: `object` = `stepSchema`

#### properties.steps.items.additionalProperties

> **additionalProperties**: `boolean` = `false`

#### properties.steps.items.properties

> **properties**: `object`

#### properties.steps.items.properties.call

> **call**: `object`

#### properties.steps.items.properties.call.type

> **type**: `string` = `"string"`

#### properties.steps.items.properties.cite

> **cite**: `object` = `citeSchema`

#### properties.steps.items.properties.cite.additionalProperties

> **additionalProperties**: `boolean` = `false`

#### properties.steps.items.properties.cite.properties

> **properties**: `object`

#### properties.steps.items.properties.cite.properties.line

> **line**: `object`

#### properties.steps.items.properties.cite.properties.line.minimum

> **minimum**: `number` = `1`

#### properties.steps.items.properties.cite.properties.line.type

> **type**: `string` = `"integer"`

#### properties.steps.items.properties.cite.properties.path

> **path**: `object`

#### properties.steps.items.properties.cite.properties.path.type

> **type**: `string` = `"string"`

#### properties.steps.items.properties.cite.required

> **required**: `string`[]

#### properties.steps.items.properties.cite.type

> **type**: `string` = `"object"`

#### properties.steps.items.properties.from

> **from**: `object`

#### properties.steps.items.properties.from.type

> **type**: `string` = `"string"`

#### properties.steps.items.properties.guard

> **guard**: `object`

#### properties.steps.items.properties.guard.type

> **type**: `string`[]

#### properties.steps.items.properties.phase

> **phase**: `object`

#### properties.steps.items.properties.phase.type

> **type**: `string`[]

#### properties.steps.items.properties.status

> **status**: `object`

#### properties.steps.items.properties.status.enum

> **enum**: `string`[]

#### properties.steps.items.properties.status.type

> **type**: `string` = `"string"`

#### properties.steps.items.properties.symbol

> **symbol**: `object`

#### properties.steps.items.properties.symbol.type

> **type**: `string` = `"string"`

#### properties.steps.items.properties.to

> **to**: `object`

#### properties.steps.items.properties.to.type

> **type**: `string` = `"string"`

#### properties.steps.items.properties.what

> **what**: `object`

#### properties.steps.items.properties.what.type

> **type**: `string` = `"string"`

#### properties.steps.items.properties.when

> **when**: `object`

#### properties.steps.items.properties.when.type

> **type**: `string`[]

#### properties.steps.items.required

> **required**: `string`[]

#### properties.steps.items.type

> **type**: `string` = `"object"`

#### properties.steps.type

> **type**: `string` = `"array"`

#### properties.summary

> **summary**: `object`

#### properties.summary.type

> **type**: `string` = `"string"`

#### properties.title

> **title**: `object`

#### properties.title.type

> **type**: `string` = `"string"`

### required

> **required**: `string`[]

### type

> **type**: `string` = `"object"`
