/** Markdown as one line of plain text: fences, block markers, emphasis, escapes and link targets removed, lines joined by spaces; longer than `max` it is cut at a word boundary with `…`. */
export function plainText(markdown: string, max = Infinity): string {
  const text = markdown.split("\n")
    .filter((line) => !/^\s*(```|~~~|-{3,}$|={3,}$)/.test(line))
    .map((line) => line
      .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)+/, "")
      .replace(/!?\[((?:\\.|[^\]\\])*)\]\([^)]*\)/g, "$1")
      .replace(/[*`~]+|(?<!\w)_+|_+(?!\w)/g, "")
      .replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, "$1")
      .trim())
    .filter(Boolean)
    .join(" ");
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1))}…`;
}
