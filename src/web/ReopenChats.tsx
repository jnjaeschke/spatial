import { useContext } from "react";
import { ClosedContext } from "./closed.ts";

/** Reopens the chats closed on this node; renders nothing when there are none. */
export function ReopenChats({ hostId }: { hostId: string }) {
  const closed = useContext(ClosedContext);
  const ids = closed?.closedOn.get(hostId) ?? [];
  if (ids.length === 0) return null;
  return <button className="reopen-chats nodrag" onClick={() => closed!.reopen(ids)}>Reopen {ids.length} closed chat{ids.length === 1 ? "" : "s"}</button>;
}
