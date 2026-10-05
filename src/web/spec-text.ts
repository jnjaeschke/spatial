/** Spec section markdown → plain text for compact cards. */
export function plainSpecText(md: string, max: number): string {
  const text = md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*\*?([^*]+)\*\*\*?/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1");
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1))}…`;
}
