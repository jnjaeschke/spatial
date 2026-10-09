import type { ReactNode } from "react";
import { Segmented } from "./Segmented.tsx";
import { setThemePreference, useThemePreference, type ThemePreference } from "./theme.ts";

const icon = (children: ReactNode) => <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;

const OPTIONS: { value: ThemePreference; icon: ReactNode; label: string }[] = [
  { value: "system", label: "System theme", icon: icon(<><rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.5" /><path d="M5.5 14h5M8 11.25V14" /></>) },
  { value: "light", label: "Light theme", icon: icon(<><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" /></>) },
  { value: "dark", label: "Dark theme", icon: icon(<path d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z" />) },
];

export function ThemeToggle() {
  const preference = useThemePreference();
  return <Segmented label="Theme" className="theme-toggle" options={OPTIONS.map((o) => ({ value: o.value, label: o.icon, title: o.label }))} value={preference} onChange={setThemePreference} />;
}
