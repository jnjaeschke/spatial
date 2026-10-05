import { useContext, useEffect, useState } from "react";
import { AskContext } from "./chat-context.ts";
import { anchorOfSelection } from "./selection.ts";

export function AskOnSelect() {
  const ask = useContext(AskContext);
  const [button, setButton] = useState<{ x: number; y: number; value: NonNullable<ReturnType<typeof anchorOfSelection>> } | null>(null);
  useEffect(() => {
    if (!ask) { setButton(null); return; }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const selection = window.getSelection();
        const value = selection && anchorOfSelection(selection);
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (!value || !range) { setButton(null); return; }
        const rect = range.getBoundingClientRect();
        setButton({ x: rect.right, y: rect.bottom, value });
      });
    };
    document.addEventListener("selectionchange", update);
    return () => { document.removeEventListener("selectionchange", update); cancelAnimationFrame(frame); };
  }, [ask]);
  if (!ask || !button) return null;
  return <button className="ask-selection" style={{ position: "fixed", left: button.x, top: button.y, zIndex: 1000 }} onMouseDown={(e) => e.preventDefault()} onClick={() => {
    ask.ask(button.value.anchor, { quote: button.value.quote, lines: button.value.lines });
    window.getSelection()?.removeAllRanges();
    setButton(null);
  }}>Ask</button>;
}
