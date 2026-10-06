import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

const KEY = "spatial.theme";
const CHANGE = "spatial-theme-change";
const darkQuery = () => matchMedia("(prefers-color-scheme: dark)");

export function themePreference(): ThemePreference {
  const stored = localStorage.getItem(KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** `data-theme` on <html> forces a palette; without it the CSS follows `prefers-color-scheme`. */
export function applyTheme(preference: ThemePreference = themePreference()): void {
  if (preference === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preference;
}

export function setThemePreference(preference: ThemePreference): void {
  if (preference === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, preference);
  applyTheme(preference);
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onChange: () => void): () => void {
  const query = darkQuery();
  query.addEventListener("change", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, themePreference);
}

export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, () => {
    const preference = themePreference();
    return preference === "system" ? (darkQuery().matches ? "dark" : "light") : preference;
  });
}
