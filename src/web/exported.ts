import type { SessionExport } from "./export-state.ts";

/** The session embedded in a static export page, else null (the live app). */
export const exported: SessionExport | null = (() => {
  const element = document.getElementById("spatial-export");
  return element ? JSON.parse(element.textContent!) as SessionExport : null;
})();

/** Seeds the exporter's view state; keys the reader already has stay, so their own changes persist across openings. */
export function seedExportedView(data: SessionExport): void {
  for (const [key, value] of Object.entries(data.view)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
}
