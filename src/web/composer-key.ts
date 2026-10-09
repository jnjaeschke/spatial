/** What a key press in a composer does. */
export function composerKey(event: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing: boolean }): "submit" | "newline" | "native" | null {
  if (event.key !== "Enter" || event.isComposing) return null;
  if (event.shiftKey) return "native";
  if (event.ctrlKey || event.metaKey) return "newline";
  if (event.altKey) return null;
  return "submit";
}

export const COMPOSER_HINT = "Enter to send, Ctrl+Enter for newline";
