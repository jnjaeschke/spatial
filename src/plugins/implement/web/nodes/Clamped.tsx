import { useState } from "react";
import { InlineText, lines } from "../../../../web/plugin-api.ts";

const CHARS_PER_LINE = 90;

/** Text clamped to three lines, with a toggle when it is longer. */
export function Clamped({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = lines(text, CHARS_PER_LINE) > 3;
  return <>
    <p className={long && !expanded ? "clamped" : undefined}><InlineText text={text} /></p>
    {long && <button type="button" className="clamp-toggle nodrag" onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Show more"}</button>}
  </>;
}
