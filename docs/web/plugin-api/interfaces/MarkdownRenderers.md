[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / MarkdownRenderers

# Interface: MarkdownRenderers

Renderer hooks of `Markdown`. Pass module-level components: a new identity remounts the rendered elements on every render, and the canvas re-renders a node on mousedown, which swallowed clicks.

## Properties

### code?

> `optional` **code?**: keyof IntrinsicElements \| `ComponentType`\<`ClassAttributes`\<`HTMLElement`\> & `HTMLAttributes`\<`HTMLElement`\> & `ExtraProps`\>

***

### link?

> `optional` **link?**: keyof IntrinsicElements \| `ComponentType`\<`ClassAttributes`\<`HTMLAnchorElement`\> & `AnchorHTMLAttributes`\<`HTMLAnchorElement`\> & `ExtraProps`\>

***

### listItem?

> `optional` **listItem?**: keyof IntrinsicElements \| `ComponentType`\<`ClassAttributes`\<`HTMLLIElement`\> & `LiHTMLAttributes`\<`HTMLLIElement`\> & `ExtraProps`\>
