import { useContext, type KeyboardEvent, type ReactNode, type ReactElement, type MouseEvent, type CSSProperties } from "react";
import { Handle, Position, useNodeId } from "@xyflow/react";
import { CollapseContext } from "./collapse.ts";
import { OpenPlaceContext } from "./open-place.ts";

export interface BoxProps {
  /** Kind slug: adds the `${kind}-node` class, which sets `--kind`. */
  kind: string;
  testId: string;
  title: ReactNode;
  children?: ReactNode;
  /** Extra classes on the root. */
  className?: string;
  /** Extra data attributes on the root. */
  data?: Record<`data-${string}`, string | number | undefined>;
  /** Buttons in the title before collapse and close. */
  actions?: ReactNode;
  /** Collapsible through CollapseContext. */
  collapse?: { key: string; label?: string; closedWithoutContext?: boolean };
  /** Shown instead of the body while collapsed. */
  stub?: ReactNode;
  /** Close action; Escape invokes it unless prevented by a child. */
  onClose?: () => void;
  closeLabel?: string;
  /** React Flow handles; nested boxes have none. */
  handles?: { source?: Position; target?: Position };
  /** A box inside another box. */
  nested?: boolean;
  onMouseDown?: (event: MouseEvent<HTMLDivElement>) => void;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  style?: CSSProperties;
}

/** The frame of a box: title row with kind color, actions, Open (for nodes that open a place), collapse and close, and the body. */
export function Box({ kind, testId, title, children, className, data, actions, collapse, stub, onClose, closeLabel = "Close", handles, nested, onMouseDown, onClick, style }: BoxProps): ReactElement {
  const collapsing = useContext(CollapseContext);
  const nodeId = useNodeId();
  const openPlace = useContext(OpenPlaceContext);
  const closed = collapse ? collapsing?.collapsed.has(collapse.key) ?? collapse.closedWithoutContext ?? false : false;
  const onKeyDown = onClose ? (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); onClose(); } } : undefined;
  const classes = [!nested && "node", "box", `${kind}-node`, closed && "collapsed", className].filter(Boolean).join(" ");
  return <div className={classes} data-testid={testId} {...data} style={style} onKeyDown={onKeyDown} onMouseDown={onMouseDown} onClick={onClick}>
    {handles?.target !== undefined && <Handle type="target" position={handles.target} />}
    {handles?.source !== undefined && <Handle type="source" position={handles.source} />}
    <div className="title">{title}{actions}{!nested && nodeId !== null && openPlace?.can(nodeId) && <button type="button" aria-label="Open" title="Open (Enter, double-click)" data-testid="open-place" className="open nodrag" onClick={() => openPlace.open(nodeId)}>Open ›</button>}{collapse && collapsing && <button aria-label={`${closed ? "Expand" : "Collapse"}${collapse.label ? ` ${collapse.label}` : ""}`} className="collapse nodrag" onClick={() => collapsing.toggle(collapse.key)}>{closed ? "▸" : "▾"}</button>}{onClose && <button aria-label={closeLabel} className="close nodrag" onClick={onClose}>×</button>}</div>
    {closed ? stub : children}
  </div>;
}
