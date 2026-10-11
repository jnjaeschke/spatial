/** Markdown as one line of plain text: block markers, fences, emphasis and link targets removed, lines joined by spaces. */
export function plainText(markdown: string): string {
  return markdown.split("\n")
    .filter((line) => !/^\s*(```|~~~|-{3,}$|={3,}$)/.test(line))
    .map((line) => line
      .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)+/, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*`~]+|(?<!\w)_+|_+(?!\w)/g, "")
      .trim())
    .filter(Boolean)
    .join(" ");
}
