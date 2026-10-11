import { plainText } from "../../../web/graph-api.ts";

/** First non-empty line of a Markdown body as plain text, with block and inline syntax stripped crudely. */
export function phabPreview(body: string, max = 120): string {
  const plain = body.split("\n").map((line) => plainText(line)).find(Boolean) ?? "";
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
