import type { DetailedHTMLProps, HTMLAttributes, ReactNode } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements { selectedcontent: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> }
  }
}

/** Whether the browser supports customizable `<select>` (`appearance: base-select`): options may then hold markup, and the closed select shows only the option label. */
export const customSelect = typeof CSS !== "undefined" && CSS.supports("appearance", "base-select");

/** Children of a `<select>` whose options carry a description: shown under the label in the picker when the select is customizable, else as the tooltip. */
export function DescribedOptions({ options }: { options: { value: string; label: string; description: string }[] }): ReactNode {
  if (!customSelect) return options.map((o) => <option key={o.value} value={o.value} title={o.description}>{o.label}</option>);
  return <>
    <button type="button"><selectedcontent /></button>
    {options.map((o) => <option key={o.value} value={o.value}><span className="option-text"><span className="option-label">{o.label}</span><span className="option-desc">{o.description}</span></span></option>)}
  </>;
}
