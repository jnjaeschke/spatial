import { setTextScale, stepTextScale, TEXT_SCALES, useTextScale } from "./text-scale.ts";

export function TextSizeControl() {
  const scale = useTextScale();
  return <div className="text-size" role="group" aria-label="Text size">
    <button type="button" aria-label="Decrease text size" title="Decrease text size (Ctrl -)" disabled={scale === TEXT_SCALES[0]} onClick={() => setTextScale(stepTextScale(scale, -1))}>A−</button>
    <button type="button" aria-label="Increase text size" title="Increase text size (Ctrl =)" disabled={scale === TEXT_SCALES.at(-1)} onClick={() => setTextScale(stepTextScale(scale, 1))}>A+</button>
  </div>;
}
