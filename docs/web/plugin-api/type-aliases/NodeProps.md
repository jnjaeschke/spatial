[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / NodeProps

# Type Alias: NodeProps\<NodeType\>

> **NodeProps**\<`NodeType`\> = `NodePropsBase`\<`NodeType`\>

When you implement a [custom node](/learn/customization/custom-nodes) it is
wrapped in a component that enables basic functionality like selection and
dragging. Your custom node receives `NodeProps` as props.

## Type Parameters

### NodeType

`NodeType` *extends* `Node` = `Node`

## Example

```tsx
import { useState } from 'react';
import { NodeProps, Node } from '@xyflow/react';

export type CounterNode = Node<{ initialCount?: number }, 'counter'>;

export default function CounterNode(props: NodeProps<CounterNode>) {
 const [count, setCount] = useState(props.data?.initialCount ?? 0);

 return (
   <div>
     <p>Count: {count}</p>
     <button className="nodrag" onClick={() => setCount(count + 1)}>
       Increment
     </button>
   </div>
 );
}
```
