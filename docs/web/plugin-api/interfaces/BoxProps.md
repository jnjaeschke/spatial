[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / BoxProps

# Interface: BoxProps

## Properties

### actions?

> `optional` **actions?**: `ReactNode`

Buttons in the title before collapse and close.

***

### children?

> `optional` **children?**: `ReactNode`

***

### className?

> `optional` **className?**: `string`

Extra classes on the root.

***

### closeLabel?

> `optional` **closeLabel?**: `string`

***

### collapse?

> `optional` **collapse?**: `object`

Collapsible through CollapseContext.

#### closedWithoutContext?

> `optional` **closedWithoutContext?**: `boolean`

#### key

> **key**: `string`

#### label?

> `optional` **label?**: `string`

***

### data?

> `optional` **data?**: `Record`\<`` `data-${string}` ``, `string` \| `number` \| `undefined`\>

Extra data attributes on the root.

***

### handles?

> `optional` **handles?**: `object`

React Flow handles; nested boxes have none.

#### source?

> `optional` **source?**: `Position`

#### target?

> `optional` **target?**: `Position`

***

### kind

> **kind**: `string`

Kind slug: adds the `${kind}-node` class, which sets `--kind`.

***

### nested?

> `optional` **nested?**: `boolean`

A box inside another box.

***

### onClick?

> `optional` **onClick?**: (`event`) => `void`

#### Parameters

##### event

`MouseEvent`\<`HTMLDivElement`\>

#### Returns

`void`

***

### onClose?

> `optional` **onClose?**: () => `void`

Close action; Escape invokes it unless prevented by a child.

#### Returns

`void`

***

### onMouseDown?

> `optional` **onMouseDown?**: (`event`) => `void`

#### Parameters

##### event

`MouseEvent`\<`HTMLDivElement`\>

#### Returns

`void`

***

### stub?

> `optional` **stub?**: `ReactNode`

Shown instead of the body while collapsed.

***

### style?

> `optional` **style?**: `CSSProperties`

***

### testId

> **testId**: `string`

***

### title

> **title**: `ReactNode`
