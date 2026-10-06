import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { App } from "./App.tsx";
import { applyTheme } from "./theme.ts";

applyTheme();
createRoot(document.getElementById("root")!).render(<App />);
