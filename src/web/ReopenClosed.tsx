import { useContext } from "react";
import { ClosedContext } from "./closed.ts";

/** Reopens the chats, notes and boxes closed on this node; renders nothing when there are none. */
export function ReopenClosed({ hostId }: { hostId: string }) {
  const closed = useContext(ClosedContext);
  const items = closed?.closedOn.get(hostId) ?? [];
  if (items.length === 0) return null;
  const kind = items.every((item) => item.kind === items[0]!.kind) ? items[0]!.kind : "item";
  return <button className="link-button reopen-closed nodrag" onClick={() => closed!.reopen(items.map((item) => item.id))}>Reopen {items.length} closed {kind}{items.length === 1 ? "" : kind === "box" ? "es" : "s"}</button>;
}
