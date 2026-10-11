import { setTextScale, stepTextScale, TEXT_SCALES, useTextScale } from "./text-scale.ts";
import { IconButton } from "./IconButton.tsx";

export function TextSizeControl() {
  const scale = useTextScale();
  return <div className="segmented text-size" role="group" aria-label="Text size">
    <IconButton label="Decrease text size" disabled={scale === TEXT_SCALES[0]} onClick={() => setTextScale(stepTextScale(scale, -1))}>A−</IconButton>
    <IconButton label="Increase text size" disabled={scale === TEXT_SCALES.at(-1)} onClick={() => setTextScale(stepTextScale(scale, 1))}>A+</IconButton>
  </div>;
}
