import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { App } from "./App.tsx";
import { applyTheme } from "./theme.ts";
import { applyTextScale } from "./text-scale.ts";

applyTheme();
applyTextScale();
createRoot(document.getElementById("root")!).render(<App />);
