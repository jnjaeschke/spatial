import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { App } from "./App.tsx";
import { applyTheme } from "./theme.ts";
import { applyTextScale, installTextScaleShortcuts } from "./text-scale.ts";
import { exported, seedExportedView } from "./exported.ts";

if (exported) seedExportedView(exported);
applyTheme();
applyTextScale();
installTextScaleShortcuts();
createRoot(document.getElementById("root")!).render(<App />);
