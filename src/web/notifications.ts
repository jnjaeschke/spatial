import type { NotifyPayload } from "../shared/types.ts";

export const DESKTOP_KEY = "spatial.desktopNotifications";

/** Desktop notifications require opt-in, browser permission, and a hidden tab. */
export function shouldDesktopNotify(i: { hidden: boolean; enabled: boolean; permission: NotificationPermission | "unsupported" }): boolean {
  return i.hidden && i.enabled && i.permission === "granted";
}

export function desktopEnabled(): boolean {
  return localStorage.getItem(DESKTOP_KEY) === "true";
}

export async function enableDesktop(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    disableDesktop();
    return false;
  }
  localStorage.setItem(DESKTOP_KEY, "true");
  return true;
}

export function disableDesktop(): void {
  localStorage.removeItem(DESKTOP_KEY);
}

export function showDesktop(n: NotifyPayload): void {
  const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  if (!shouldDesktopNotify({ hidden: document.hidden, enabled: desktopEnabled(), permission })) return;
  const notification = new Notification(n.title, { body: n.body, tag: n.id });
  notification.onclick = () => window.focus();
}
