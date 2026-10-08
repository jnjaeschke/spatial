/** First non-empty line of a Markdown body as plain text, with block and inline syntax stripped crudely. */
export function phabPreview(body: string, max = 120): string {
  const line = body.split("\n").map((item) => item.trim()).find((item) => item && !/^(```|~~~|-{3,}$|={3,}$)/.test(item)) ?? "";
  const plain = line
    .replace(/^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)+/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*`~]+|(?<!\w)_+|_+(?!\w)/g, "")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
